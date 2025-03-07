import type { GetColumnData } from '~/column';
import { entityKind } from '~/entity';
import type { SelectResultFields } from '~/query-builders/select.types';
import { QueryPromise } from '~/query-promise';
import type { Query, SQL, SQLWrapper } from '~/sql';
import type { SQLiteDialect } from '~/sqlite-core/dialect';
import type { PreparedQuery, SQLiteSession } from '~/sqlite-core/session';
import type { AnySQLiteTable } from '~/sqlite-core/table';
import { SQLiteTable } from '~/sqlite-core/table';
import type { InferModel } from '~/table';
import { type DrizzleTypeError, mapUpdateSet, orderSelectedFields, type UpdateSet } from '~/utils';
import type { SelectedFields, SelectedFieldsOrdered } from './select.types';

export interface SQLiteUpdateConfig {
	where?: SQL | undefined;
	set: UpdateSet;
	table: AnySQLiteTable;
	returning?: SelectedFieldsOrdered;
}

export type SQLiteUpdateSetSource<TTable extends AnySQLiteTable> =
	& {
		[Key in keyof TTable['_']['columns']]?:
			| GetColumnData<TTable['_']['columns'][Key], 'query'>
			| SQL;
	}
	& {};

export class SQLiteUpdateBuilder<
	TTable extends AnySQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
> {
	static readonly [entityKind]: string = 'SQLiteUpdateBuilder';

	declare readonly _: {
		readonly table: TTable;
	};

	constructor(
		protected table: TTable,
		protected session: SQLiteSession<any, any, any, any>,
		protected dialect: SQLiteDialect,
	) {}

	set(values: SQLiteUpdateSetSource<TTable>): SQLiteUpdate<TTable, TResultType, TRunResult> {
		return new SQLiteUpdate(this.table, mapUpdateSet(this.table, values), this.session, this.dialect);
	}
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SQLiteUpdate<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends AnySQLiteTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TResultType extends 'sync' | 'async',
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TRunResult,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TReturning = undefined,
> extends SQLWrapper, QueryPromise<TReturning extends undefined ? TRunResult : TReturning[]> {}

export class SQLiteUpdate<
	TTable extends AnySQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning = undefined,
> extends QueryPromise<TReturning extends undefined ? TRunResult : TReturning[]> implements SQLWrapper {
	static readonly [entityKind]: string = 'SQLiteUpdate';

	declare readonly _: {
		readonly table: TTable;
	};

	private config: SQLiteUpdateConfig;

	constructor(
		table: TTable,
		set: UpdateSet,
		private session: SQLiteSession<any, any, any, any>,
		private dialect: SQLiteDialect,
	) {
		super();
		this.config = { set, table };
	}

	where(where: SQL | undefined): Omit<this, 'where'> {
		this.config.where = where;
		return this;
	}

	returning(): SQLiteUpdate<TTable, TResultType, TRunResult, InferModel<TTable>>;
	returning<TSelectedFields extends SelectedFields>(
		fields: TSelectedFields,
	): SQLiteUpdate<TTable, TResultType, TRunResult, SelectResultFields<TSelectedFields>>;
	returning(
		fields: SelectedFields = this.config.table[SQLiteTable.Symbol.Columns],
	): SQLiteUpdate<TTable, TResultType, TRunResult, InferModel<TTable>> {
		this.config.returning = orderSelectedFields(fields);
		return this as SQLiteUpdate<TTable, TResultType, TRunResult, InferModel<TTable>>;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildUpdateQuery(this.config);
	}

	toSQL(): { sql: Query['sql']; params: Query['params'] } {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(isOneTimeQuery?: boolean): PreparedQuery<
		{
			type: TResultType;
			run: TRunResult;
			all: TReturning extends undefined ? DrizzleTypeError<'.all() cannot be used without .returning()'> : TReturning[];
			get: TReturning extends undefined ? DrizzleTypeError<'.get() cannot be used without .returning()'> : TReturning;
			values: TReturning extends undefined ? DrizzleTypeError<'.values() cannot be used without .returning()'>
				: any[][];
			execute: TReturning extends undefined ? TRunResult : TReturning[];
		}
	> {
		return this.session[isOneTimeQuery ? 'prepareOneTimeQuery' : 'prepareQuery'](
			this.dialect.sqlToQuery(this.getSQL()),
			this.config.returning,
			this.config.returning ? 'all' : 'run',
		) as ReturnType<this['prepare']>;
	}

	run: ReturnType<this['prepare']>['run'] = (placeholderValues) => {
		return this.prepare(true).run(placeholderValues);
	};

	all: ReturnType<this['prepare']>['all'] = (placeholderValues) => {
		return this.prepare(true).all(placeholderValues);
	};

	get: ReturnType<this['prepare']>['get'] = (placeholderValues) => {
		return this.prepare(true).get(placeholderValues);
	};

	values: ReturnType<this['prepare']>['values'] = (placeholderValues) => {
		return this.prepare(true).values(placeholderValues);
	};

	override async execute(): Promise<TReturning extends undefined ? TRunResult : TReturning[]> {
		return (this.config.returning ? this.all() : this.run()) as TReturning extends undefined ? TRunResult
			: TReturning[];
	}
}
