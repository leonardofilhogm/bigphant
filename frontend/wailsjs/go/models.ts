export namespace connections {
	
	export class ConnectionInput {
	    name: string;
	    driver: string;
	    host: string;
	    port: number;
	    username: string;
	    password: string;
	    default_database: string;
	    read_only: boolean;
	    transaction_mode: string;
	    label: string;
	    label_color: string;
	    folder: string;
	
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
	        this.default_database = source["default_database"];
	        this.read_only = source["read_only"];
	        this.transaction_mode = source["transaction_mode"];
	        this.label = source["label"];
	        this.label_color = source["label_color"];
	        this.folder = source["folder"];
	    }
	}
	export class ConnectionMeta {
	    id: string;
	    name: string;
	    driver: string;
	    host: string;
	    port: number;
	    username: string;
	    default_database: string;
	    read_only: boolean;
	    transaction_mode: string;
	    label: string;
	    label_color: string;
	    folder: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.driver = source["driver"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.default_database = source["default_database"];
	        this.read_only = source["read_only"];
	        this.transaction_mode = source["transaction_mode"];
	        this.label = source["label"];
	        this.label_color = source["label_color"];
	        this.folder = source["folder"];
	    }
	}

}

export namespace main {
	
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

export namespace mysql {
	
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
	
	    static createFrom(source: any = {}) {
	        return new TableSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.row_count = source["row_count"];
	        this.engine = source["engine"];
	        this.size_bytes = source["size_bytes"];
	    }
	}

}

export namespace settings {
	
	export class AppSettings {
	    allow_destructive_without_where: boolean;
	    default_transaction_mode: string;
	    theme: string;
	
	    static createFrom(source: any = {}) {
	        return new AppSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.allow_destructive_without_where = source["allow_destructive_without_where"];
	        this.default_transaction_mode = source["default_transaction_mode"];
	        this.theme = source["theme"];
	    }
	}

}

export namespace sqlbuilder {
	
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

