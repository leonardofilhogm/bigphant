export namespace ai {
	
	export class Model {
	    id: string;
	    name: string;
	    context_length: number;
	
	    static createFrom(source: any = {}) {
	        return new Model(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.context_length = source["context_length"];
	    }
	}

}

export namespace connections {
	
	export class ConnectionInput {
	    name: string;
	    driver: string;
	    host: string;
	    port: number;
	    username: string;
	    password: string;
	    file_path: string;
	    default_database: string;
	    sslmode: string;
	    read_only: boolean;
	    transaction_mode: string;
	    edit_mode: string;
	    label: string;
	    label_color: string;
	    folder: string;
	    ssh_enabled: boolean;
	    ssh_host: string;
	    ssh_port: number;
	    ssh_username: string;
	    ssh_auth_method: string;
	    ssh_password: string;
	    ssh_key_path: string;
	    ssh_private_key: string;
	    ssh_passphrase: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.driver = source["driver"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.file_path = source["file_path"];
	        this.default_database = source["default_database"];
	        this.sslmode = source["sslmode"];
	        this.read_only = source["read_only"];
	        this.transaction_mode = source["transaction_mode"];
	        this.edit_mode = source["edit_mode"];
	        this.label = source["label"];
	        this.label_color = source["label_color"];
	        this.folder = source["folder"];
	        this.ssh_enabled = source["ssh_enabled"];
	        this.ssh_host = source["ssh_host"];
	        this.ssh_port = source["ssh_port"];
	        this.ssh_username = source["ssh_username"];
	        this.ssh_auth_method = source["ssh_auth_method"];
	        this.ssh_password = source["ssh_password"];
	        this.ssh_key_path = source["ssh_key_path"];
	        this.ssh_private_key = source["ssh_private_key"];
	        this.ssh_passphrase = source["ssh_passphrase"];
	    }
	}
	export class ConnectionMeta {
	    id: string;
	    // Go type: time
	    created_at: any;
	    name: string;
	    driver: string;
	    host: string;
	    port: number;
	    username: string;
	    file_path: string;
	    default_database: string;
	    sslmode: string;
	    read_only: boolean;
	    transaction_mode: string;
	    edit_mode: string;
	    label: string;
	    label_color: string;
	    folder: string;
	    ssh_enabled: boolean;
	    ssh_host: string;
	    ssh_port: number;
	    ssh_username: string;
	    ssh_auth_method: string;
	    ssh_key_path: string;
	    ai_enabled: boolean;
	    ai_mode: string;
	    locked?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.name = source["name"];
	        this.driver = source["driver"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.file_path = source["file_path"];
	        this.default_database = source["default_database"];
	        this.sslmode = source["sslmode"];
	        this.read_only = source["read_only"];
	        this.transaction_mode = source["transaction_mode"];
	        this.edit_mode = source["edit_mode"];
	        this.label = source["label"];
	        this.label_color = source["label_color"];
	        this.folder = source["folder"];
	        this.ssh_enabled = source["ssh_enabled"];
	        this.ssh_host = source["ssh_host"];
	        this.ssh_port = source["ssh_port"];
	        this.ssh_username = source["ssh_username"];
	        this.ssh_auth_method = source["ssh_auth_method"];
	        this.ssh_key_path = source["ssh_key_path"];
	        this.ai_enabled = source["ai_enabled"];
	        this.ai_mode = source["ai_mode"];
	        this.locked = source["locked"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace dbtypes {
	
	export class Column {
	    name: string;
	    type: string;
	
	    static createFrom(source: any = {}) {
	        return new Column(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	    }
	}
	export class ColumnInfo {
	    name: string;
	    type: string;
	    nullable: boolean;
	    default?: string;
	    key: string;
	    extra: string;
	
	    static createFrom(source: any = {}) {
	        return new ColumnInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	        this.nullable = source["nullable"];
	        this.default = source["default"];
	        this.key = source["key"];
	        this.extra = source["extra"];
	    }
	}
	export class Entity {
	    name: string;
	    kind: string;
	    schema: string;
	    owner: string;
	    extra: string;
	
	    static createFrom(source: any = {}) {
	        return new Entity(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.kind = source["kind"];
	        this.schema = source["schema"];
	        this.owner = source["owner"];
	        this.extra = source["extra"];
	    }
	}
	export class IndexInfo {
	    name: string;
	    columns: string[];
	    unique: boolean;
	
	    static createFrom(source: any = {}) {
	        return new IndexInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.columns = source["columns"];
	        this.unique = source["unique"];
	    }
	}
	export class ResultSet {
	    columns: Column[];
	    rows: any[][];
	    row_count: number;
	    sql: string;
	
	    static createFrom(source: any = {}) {
	        return new ResultSet(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.columns = this.convertValues(source["columns"], Column);
	        this.rows = source["rows"];
	        this.row_count = source["row_count"];
	        this.sql = source["sql"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RawResult {
	    is_query: boolean;
	    result_set?: ResultSet;
	    affected_rows: number;
	    duration_ms: number;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new RawResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.is_query = source["is_query"];
	        this.result_set = this.convertValues(source["result_set"], ResultSet);
	        this.affected_rows = source["affected_rows"];
	        this.duration_ms = source["duration_ms"];
	        this.status = source["status"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class TableStructure {
	    columns: ColumnInfo[];
	    indexes: IndexInfo[];
	    primary_key: string[];
	
	    static createFrom(source: any = {}) {
	        return new TableStructure(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.columns = this.convertValues(source["columns"], ColumnInfo);
	        this.indexes = this.convertValues(source["indexes"], IndexInfo);
	        this.primary_key = source["primary_key"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TableSummary {
	    name: string;
	    row_count: number;
	    engine: string;
	    size_bytes: number;
	    data_size_bytes: number;
	    index_size_bytes: number;
	    charset: string;
	
	    static createFrom(source: any = {}) {
	        return new TableSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.row_count = source["row_count"];
	        this.engine = source["engine"];
	        this.size_bytes = source["size_bytes"];
	        this.data_size_bytes = source["data_size_bytes"];
	        this.index_size_bytes = source["index_size_bytes"];
	        this.charset = source["charset"];
	    }
	}

}

export namespace license {
	
	export class Device {
	    device_id: string;
	    name: string;
	    platform: string;
	    last_seen_at: number;
	
	    static createFrom(source: any = {}) {
	        return new Device(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.device_id = source["device_id"];
	        this.name = source["name"];
	        this.platform = source["platform"];
	        this.last_seen_at = source["last_seen_at"];
	    }
	}
	export class FeatureSet {
	    max_connections: number;
	    export: boolean;
	    backup: boolean;
	    modify_schema: boolean;
	    ai: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FeatureSet(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.max_connections = source["max_connections"];
	        this.export = source["export"];
	        this.backup = source["backup"];
	        this.modify_schema = source["modify_schema"];
	        this.ai = source["ai"];
	    }
	}
	export class Info {
	    state: string;
	    plan: string;
	    email: string;
	    key_masked: string;
	    features: FeatureSet;
	    last_validated_at: number;
	    can_write: boolean;
	    show_close_upsell: boolean;
	    checkout_url: string;
	    max_connections: number;
	    connection_count: number;
	    device_id: string;
	
	    static createFrom(source: any = {}) {
	        return new Info(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.state = source["state"];
	        this.plan = source["plan"];
	        this.email = source["email"];
	        this.key_masked = source["key_masked"];
	        this.features = this.convertValues(source["features"], FeatureSet);
	        this.last_validated_at = source["last_validated_at"];
	        this.can_write = source["can_write"];
	        this.show_close_upsell = source["show_close_upsell"];
	        this.checkout_url = source["checkout_url"];
	        this.max_connections = source["max_connections"];
	        this.connection_count = source["connection_count"];
	        this.device_id = source["device_id"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace main {
	
	export class AIChatMessage {
	    role: string;
	    content: string;
	
	    static createFrom(source: any = {}) {
	        return new AIChatMessage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.role = source["role"];
	        this.content = source["content"];
	    }
	}
	export class AIChatRequest {
	    database: string;
	    messages: AIChatMessage[];
	
	    static createFrom(source: any = {}) {
	        return new AIChatRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.database = source["database"];
	        this.messages = this.convertValues(source["messages"], AIChatMessage);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AIChatResponse {
	    answer: string;
	
	    static createFrom(source: any = {}) {
	        return new AIChatResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.answer = source["answer"];
	    }
	}
	export class AIConfig {
	    has_key: boolean;
	    model: string;
	
	    static createFrom(source: any = {}) {
	        return new AIConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.has_key = source["has_key"];
	        this.model = source["model"];
	    }
	}
	export class AIEnableResult {
	    mode: string;
	    context_generated: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AIEnableResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mode = source["mode"];
	        this.context_generated = source["context_generated"];
	    }
	}
	export class AIStatus {
	    has_key: boolean;
	    enabled: boolean;
	    mode: string;
	    has_context: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AIStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.has_key = source["has_key"];
	        this.enabled = source["enabled"];
	        this.mode = source["mode"];
	        this.has_context = source["has_context"];
	    }
	}
	export class AlterPreview {
	    sql: string[];
	    destructive: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AlterPreview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sql = source["sql"];
	        this.destructive = source["destructive"];
	    }
	}
	export class ExecOptions {
	    bypass_destructive_check: boolean;
	    database: string;
	
	    static createFrom(source: any = {}) {
	        return new ExecOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.bypass_destructive_check = source["bypass_destructive_check"];
	        this.database = source["database"];
	    }
	}
	export class TestResult {
	    ok: boolean;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new TestResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.message = source["message"];
	    }
	}

}

export namespace settings {
	
	export class AppSettings {
	    allow_destructive_without_where: boolean;
	    default_transaction_mode: string;
	    theme: string;
	    onboarding_completed: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AppSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.allow_destructive_without_where = source["allow_destructive_without_where"];
	        this.default_transaction_mode = source["default_transaction_mode"];
	        this.theme = source["theme"];
	        this.onboarding_completed = source["onboarding_completed"];
	    }
	}

}

export namespace sqlbuilder {
	
	export class ForeignKeyDef {
	    name: string;
	    columns: string[];
	    ref_table: string;
	    ref_columns: string[];
	    on_delete: string;
	    on_update: string;
	
	    static createFrom(source: any = {}) {
	        return new ForeignKeyDef(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.columns = source["columns"];
	        this.ref_table = source["ref_table"];
	        this.ref_columns = source["ref_columns"];
	        this.on_delete = source["on_delete"];
	        this.on_update = source["on_update"];
	    }
	}
	export class IndexDef {
	    name: string;
	    columns: string[];
	    unique: boolean;
	
	    static createFrom(source: any = {}) {
	        return new IndexDef(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.columns = source["columns"];
	        this.unique = source["unique"];
	    }
	}
	export class ColumnDef {
	    name: string;
	    type: string;
	    nullable: boolean;
	    has_default: boolean;
	    default: string;
	    default_is_expr: boolean;
	    auto_increment: boolean;
	    comment: string;
	
	    static createFrom(source: any = {}) {
	        return new ColumnDef(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	        this.nullable = source["nullable"];
	        this.has_default = source["has_default"];
	        this.default = source["default"];
	        this.default_is_expr = source["default_is_expr"];
	        this.auto_increment = source["auto_increment"];
	        this.comment = source["comment"];
	    }
	}
	export class AlterOp {
	    kind: string;
	    column?: ColumnDef;
	    old_name?: string;
	    new_name?: string;
	    position?: string;
	    index?: IndexDef;
	    foreign_key?: ForeignKeyDef;
	    name?: string;
	    columns?: string[];
	    check?: string;
	
	    static createFrom(source: any = {}) {
	        return new AlterOp(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.column = this.convertValues(source["column"], ColumnDef);
	        this.old_name = source["old_name"];
	        this.new_name = source["new_name"];
	        this.position = source["position"];
	        this.index = this.convertValues(source["index"], IndexDef);
	        this.foreign_key = this.convertValues(source["foreign_key"], ForeignKeyDef);
	        this.name = source["name"];
	        this.columns = source["columns"];
	        this.check = source["check"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AlterTableRequest {
	    database: string;
	    table: string;
	    ops: AlterOp[];
	
	    static createFrom(source: any = {}) {
	        return new AlterTableRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.database = source["database"];
	        this.table = source["table"];
	        this.ops = this.convertValues(source["ops"], AlterOp);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Filter {
	    column: string;
	    comparator: string;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new Filter(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.column = source["column"];
	        this.comparator = source["comparator"];
	        this.value = source["value"];
	    }
	}
	export class FetchRowsRequest {
	    database: string;
	    table: string;
	    filters: Filter[];
	    limit: number;
	    offset: number;
	    order_by: string;
	    order_dir: string;
	
	    static createFrom(source: any = {}) {
	        return new FetchRowsRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.database = source["database"];
	        this.table = source["table"];
	        this.filters = this.convertValues(source["filters"], Filter);
	        this.limit = source["limit"];
	        this.offset = source["offset"];
	        this.order_by = source["order_by"];
	        this.order_dir = source["order_dir"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	

}

