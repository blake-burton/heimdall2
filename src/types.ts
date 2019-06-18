const DATA_NOT_FOUND_MESSAGE : string = "N/A";
const NUMBER_NOT_FOUND : number = -1;

/*
Compendium of changes from base store, aside from the obvious:
"impact" of a control is no longer a string, but a number. Cast it yourself
"profile" attribute of a control is now referred to as profile_name. It will by default fetch its "owner" object name, unless one does not exist,
    in which case it will use the autogenerated one via the old method

*/

function fixParagraphData(s : string | undefined) : string {
    // Given a string or undefined s, will return that string/undefined
    // as a paragraph broken up by <br> tags instead of newlines
    if(s) {
        return s.replace(new RegExp("\n", 'g'), '<br>');
    }
    else {
        return DATA_NOT_FOUND_MESSAGE;
    }
}

class InspecOutput {
    /* Contains the result(s) of running one or more inspec profiles */
    version : string;
    platform : string;
    controls : Control[];
    profiles : Profile[];

    // TODO: We don't currently properly handle these
    other_checks : any[];
    statistics : any;
    

    constructor(jsonObject : any) {
        // No parent; this is a top level type
        // Abbreviate our param to make this nicer looking
        let o = jsonObject;

        // Save these to properties
        this.version  = o.version  || DATA_NOT_FOUND_MESSAGE;
        this.platform = o.platform || DATA_NOT_FOUND_MESSAGE;
        this.controls = (o.controls || []).map((c : any) => new Control(this, c));
        this.profiles = (o.profiles || []).map((p : any) => new Profile(this, p));
        this.other_checks = o.other_checks || [];
        this.statistics = o.statistics || {};
    }
}

class Profile {
    /* The data of an inspec profile. May contain results, if it was part of a run */
    parent : InspecOutput | undefined;
    name : string;
    title : string;
    maintainer : string;
    copyright : string;
    copyright_email : string;
    license : string;
    summary : string;
    version : string;
    depends : string;
    supports : string;
    sha256 : string;
    generator_name: string;
    generator_version: string;
    controls : Control[];
    groups : Group[];
    attributes : Attribute[];



    constructor(parent : InspecOutput | undefined, jsonObject : any) {
        // Save our parent. Would be of type InspecOutput
        // Note: can be null, in case of loading a profile independently
        this.parent = parent;
        
        // Abbreviate our param to make this nicer looking
        let o = jsonObject;

        // These we assign immediately
        this.name = o.name || DATA_NOT_FOUND_MESSAGE;
        this.title = o.title || DATA_NOT_FOUND_MESSAGE;
        this.maintainer = o.maintainer || DATA_NOT_FOUND_MESSAGE;
        this.copyright = o.copyright || DATA_NOT_FOUND_MESSAGE;
        this.copyright_email = o.copyright_email || DATA_NOT_FOUND_MESSAGE;
        this.license = o.license || DATA_NOT_FOUND_MESSAGE;
        this.summary = o.summary || DATA_NOT_FOUND_MESSAGE;
        this.version = o.version || DATA_NOT_FOUND_MESSAGE;
        this.depends = o.depends || DATA_NOT_FOUND_MESSAGE;
        this.supports = o.supports || DATA_NOT_FOUND_MESSAGE;
        this.sha256 = o.sha256 || DATA_NOT_FOUND_MESSAGE;

        // These we break out of their nesting
        if(o.generator){
            this.generator_name = o.generator.name || DATA_NOT_FOUND_MESSAGE;
            this.generator_version = o.generator.version  || DATA_NOT_FOUND_MESSAGE;
        } else {
            this.generator_name = DATA_NOT_FOUND_MESSAGE;
            this.generator_version = DATA_NOT_FOUND_MESSAGE;
        }
        
        // Get controls, groups, and attributes. 
        this.controls   = (o.controls   || []).map((c : any) => new Control(this, c));
        this.groups     = (o.groups     || []).map((g : any) => new Group(this, g));
        this.attributes = (o.attributes || []).map((a : any) => new Attribute(this, a));
    }
}


class Control {
    /* The data of an inspec control. May contain results, if it was part of a run */
    parent : Profile | InspecOutput;
    tags : ControlTags;
    results : ControlResult[];
    rule_title : string;
    vuln_discuss : string;
    code : string;
    impact: number;
    vuln_num : string;
    source_file : string;
    source_line : number;
    message : string;

    // TODO: We don't currently properly handle these
    refs : any[];


    constructor(parent : Profile | InspecOutput, jsonObject : any) {
        // Set the parent. 
        this.parent = parent;

        // Abbreviate our param to make this all nicer looking
        let o = jsonObject;

        // Save and rename data to match what was in store
        this.rule_title = o.title || DATA_NOT_FOUND_MESSAGE;
        this.refs = o.refs || DATA_NOT_FOUND_MESSAGE;
        this.tags = new ControlTags(this, o.tags);

        // This long-form data needs to be fixed for proper html formatting
        this.code = fixParagraphData(o.code);
        this.vuln_discuss = fixParagraphData(o.desc);

        // As numbers, impact and code need to be strings for consistency
        // We keep impact for computing severity
        this.impact = o.impact || NUMBER_NOT_FOUND;
        this.code = o.code || DATA_NOT_FOUND_MESSAGE;

        // The id/vuln_num is truncated partially. I don't really know why - wisdom of the elders I guess
        this.vuln_num = o.id || DATA_NOT_FOUND_MESSAGE;
        if(this.vuln_num.match(/\d+\.\d+/)) { // Taken from store - reason unclear
            let match = this.vuln_num.match(/\d+(\.\d+)*/);
            if (match) {
                this.vuln_num = match[0];
            }
        }

        // Have to pull these out but not terribly difficult
        if(o.source_location) {
            this.source_file = o.source_location.ref || DATA_NOT_FOUND_MESSAGE;
            this.source_line = o.source_location.line || NUMBER_NOT_FOUND;
        }
        else {
            this.source_file = DATA_NOT_FOUND_MESSAGE;
            this.source_line = NUMBER_NOT_FOUND;
        }

        // Next, we handle building message, and interring results
        // Initialize message. If it's of no impact, prefix with what it is
        if(this.impact == 0) {
            this.message = this.vuln_discuss + "\n\n";
        } else {
            this.message = "";
        }

        // Track statuses and results as well
        let results : any[] = o.results || [];
        this.results = results.map((r : any) => new ControlResult(this, r));

        // Compose our message
        this.results.forEach(r => this.message += r.toMessageLine());
    }

    get finding_details() : string {
        let result = '';
        switch(this.status) {
            case "Failed": 
                return "One or more of the automated tests failed or was inconclusive for the control \n\n " + this.message + "\n";
            case "Passed": 
                return "All Automated tests passed for the control \n\n " + this.message + "\n"; 
            case "Not Reviewed": 
                return "Automated test skipped due to known accepted condition in the control : \n\n" + this.message + "\n"; 
            case "Not Applicable": 
                return "Justification: \n\n" + this.message + "\n"; 
            case "Profile Error":
                if (this.message) {
                    return "Exception: \n\n" + this.message + "\n";
                } else {
                    return "No test available for this control";
                }
            default:
                throw "Error: invalid status generated"
        }
    }

    get status() : string {
        throw "Not implemented";
    }

    get severity() : string {
        /* Compute the severity of this report as a string */
        if (this.impact < 0.1) {
            return "none";
        } else if (this.impact < 0.4) {
            return "low";
        } else if (this.impact < 0.7) {
            return "medium";
        } else if (this.impact < 0.9) {
            return "high";
        } else  {
            return "critical";
        }
    }

    get profile_name() : string {
        /* Returns the programatically determined profile name of this control */
        let prefix;
        if(this.parent instanceof InspecOutput) {
            // It's a result - name as such
            prefix = "result;"
        }
        else {
            prefix = "profile;"
        }
        return prefix + this.rule_title + ": " + this.parent.version;
    }

    get start_time() {
        /* Returns the start time of this control's run, as determiend by the time of the first test*/
        if(this.results) {
            return this.results[0].start_time;
        }
        else {
            return DATA_NOT_FOUND_MESSAGE;
        }
    }

    get status_list() {
        return this.results.map(r => r.status);
    }
}


class ControlTags {
    /* Contains data for the tags on a Control.  */
    parent : Control;
    gid : string;
    group_title : string;
    rule_id : string;
    rule_ver : string;
    cci_ref : string;
    cis_family : string;
    cis_rid : string;
    cis_level : string;
    check_content : string;
    fix_text : string;
    rationale : string;
    nist : string[];

    constructor(parent : Control, jsonObject : any){
        // Set the parent. 
        this.parent = parent;

        // Abbreviate our param to make this all nicer looking
        let o = jsonObject;

        this.gid = o.gid || DATA_NOT_FOUND_MESSAGE;
        this.group_title = o.gtitle || DATA_NOT_FOUND_MESSAGE;
        this.rule_id = o.rid || DATA_NOT_FOUND_MESSAGE;
        this.rule_ver = o.stig_id || DATA_NOT_FOUND_MESSAGE;
        this.cci_ref = o.cci || DATA_NOT_FOUND_MESSAGE;
        this.cis_family = o.cis_family || DATA_NOT_FOUND_MESSAGE;
        this.cis_rid = o.cis_rid || DATA_NOT_FOUND_MESSAGE;
        this.cis_level = o.cis_level || DATA_NOT_FOUND_MESSAGE;

        // This case is slightly special as nist is a list.
        this.nist = o.nist || ['unmapped'];

        // These need slight correction, as they are paragraphs of data
        this.check_content = fixParagraphData(o.check);
        this.fix_text = fixParagraphData(o.fix);
        this.rationale = fixParagraphData(o.rationale);
    }
}


class ControlResult {
    /* Holds the results of (part of) a single control.  */
    parent : Control;
    start_time : string;
    backtrace : string;
    status : string;
    skip_message : string;
    code_desc : string;
    message : string;
    exception : any;

    constructor(parent : Control, jsonObject : any) {
        // Set the parent. 
        this.parent = parent;

        // Abbreviate our param to make this all nicer looking
        let o = jsonObject;

        // Rest we copy more or less as normal
        this.start_time = o.start_time || DATA_NOT_FOUND_MESSAGE;
        this.backtrace = o.backtrace || DATA_NOT_FOUND_MESSAGE;
        this.status = o.status || DATA_NOT_FOUND_MESSAGE;
        this.skip_message = o.skip_message || DATA_NOT_FOUND_MESSAGE;
        this.code_desc = o.code_desc || DATA_NOT_FOUND_MESSAGE;
        this.message = o.message || DATA_NOT_FOUND_MESSAGE;
        this.exception = o.exception;
    }

    toMessageLine() {
        switch(this.status) {
            case "skipped": 
                return "SKIPPED -- " + this.skip_message + "\n";
            case "failed":  
                return "FAILED -- Test: " + this.code_desc + "\nMessage: " + this.message + "\n";
            case "passed":  
                return "PASSED -- " + this.code_desc + "\n";
            case "error": 
                return "ERROR -- Test: " + this.code_desc + "\nMessage: " + this.message + "\n";
            default:
                return "Exception: " + this.exception + "\n";
        }
    }
}


class Group {
    /* Contains information regarding the grouping of a controls within a profile */

    parent : Profile;
    title : string;
    controls : string[];
    id : string;

    constructor(parent : Profile, jsonObject : any) {
        // Set the parent.
        this.parent = parent;

        // Abbreviate our param to make this all nicer looking
        let o = jsonObject;

        this.title = o.title || DATA_NOT_FOUND_MESSAGE;
        this.controls = o.controls || [];
        this.id = o.id || DATA_NOT_FOUND_MESSAGE;
    }

    // TODO: Make a function to grab the actual controls via routing thru parent
}

class Attribute {
    /* Contains further information about a profile*/

    parent : Profile;
    name : string;
    options_description : string;
    options_default : string;

    constructor(parent : Profile, jsonObject : any) {
        // Set the parent. Would be of type Profile
        this.parent = parent;

        // Abbreviate our param to make this all nicer looking
        let o = jsonObject;

        // Extract rest from json
        this.name = o.name;
        if(o.options) {
            this.options_description = o.options.description || DATA_NOT_FOUND_MESSAGE;
            this.options_default = o.options.default || DATA_NOT_FOUND_MESSAGE;
        } else {
            this.options_description = DATA_NOT_FOUND_MESSAGE;
            this.options_default = DATA_NOT_FOUND_MESSAGE;
        }
    }
}