!function(){

	var   Class 		= require('ee-class')
		, EventEmitter 	= require('ee-event-emitter')
		, log 			= require('ee-log')
		, async 		= require('ee-async')
		, Set 			= require('./Set');




	module.exports = new Class({
		init: function(options) {
			this._resource 	= options.resource;
			this._orm 		= options.orm;
		}



		, find: function(callback){
			var resource = this._resource;

			// prepare child queries
			this._prepareChildResources(resource);

			//log(resource.query);

			// execut ebase query
			this._executeQuery(resource.query, function(err, rows){
				if (err) callback(err);
				else {
					var queries;

					// create set
					resource.set = this._makeSet(rows, resource);

					if (resource.set.length) {					

						// collect queries
						queries = this._collectQueries(resource, []);

						// execute queries
						this._executeSubqueries(resource, queries, callback);
					}
					else callback(null, resource.set);
				}
			}.bind(this));
		}



		, _executeSubqueries: function(rootResource, queries, callback) {

			async.each(queries, 

			function(resource, next){

				// filter the resource by the ids of the root resource
				rootResource.applyFilter(resource);

				this._executeQuery(resource.query, function(err, rows){
					if (err) next(err);
					else {
						resource.set = this._makeSet(rows, resource);
						next();
					}
				}.bind(this));
			}.bind(this), 

			function(err, results){
				if (err) callback(results.filter(function(x){return x instanceof Error;})[0]);
				else {
					this._buildRelations(this._resource);
					callback(null, this._resource.set);
				}
			}.bind(this));
		}



		, _buildRelations: function(resource) {
			if (resource.set && resource.hasChildren()) {
				resource.children.forEach(function(childResource){
					if (childResource.set) {

						childResource.set.forEach(function(record){

							record._mappingIds.forEach(function(mappingId){
								var parentRecord = resource.set.getByColumnValue('_primary', mappingId);

								if (parentRecord) {
									if (childResource.type === 'mapping' || childResource.type === 'belongsTo') {
										parentRecord[childResource.name].addExisiting(record);
									}
									else {
										parentRecord[childResource.name] = record;
									}
								}	
							}.bind(this));												
						}.bind(this));

						this._buildRelations(childResource);
					}				
				}.bind(this));
			}
		}



		// get all selected queries, add the correct filter to them
		, _collectQueries: function(resource, queries) {
			if (resource.hasChildren()) {
				resource.children.forEach(function(childResource){
					if (childResource.selected) queries.push(childResource);
					this._collectQueries(childResource, queries);
				}.bind(this));
			}

			return queries;
		}



		// parse the the resource tree, check which queriies to execute
		// traverse the tree, check if the children are selected, if yes:
		// select all parents
		, _prepareChildResources: function(resource) {
			if (resource.hasChildren()) {
				resource.children.forEach(function(childResource){
					if (childResource.selected) 		this._selectParents(childResource);
					if (childResource.hasRootFilter) 	this._filterParents(childResource);
					if (childResource.filtered) 		this._filterByChildren(childResource, [], childResource.query.filter, childResource.query.from);

					this._prepareChildResources(childResource);
				}.bind(this));
			}
		}


		, _filterByChildren: function(resource, joins, filter, resourceName) {
			if (!resource.selected) {
				if (!resource.childrenFiltered) {
					joins = joins.concat(resource.joins.map(function(joinStatement){
						return joinStatement.reverseFormat();
					}));

					resource.childrenFiltered = true;
				}

				if (resource.parentResource) this._filterByChildren(resource.parentResource, joins, filter, resourceName);
			}
			else if(resource.query.filter !== filter) {
				// apply filter & joins
				resource.query.filter[resourceName] = filter;
				resource.query.join = resource.query.join.concat(joins);
			}
		}


		// recursive select
		, _selectParents: function(resource) {
			resource.select();
			if (resource.parentResource) {
				resource.parentResource.loadRelatingSet(resource.name);
				this._selectParents(resource.parentResource);
			}
		}





		, _filterParents: function(resource, originalResource) {
			if (resource.parentResource) this._filterParents(resource.parentResource);
			resource.filter();
		}



		, _executeQuery: function(query, callback){
			this._orm.getDatabase().getConnection(function(err, connection){
				if (err) callback(err);
				else connection.query(query, callback);
			}.bind(this));
		}



		, _makeSet: function(rows, resource) {
			var records = new Set({
				  primaryKeys: 	resource.primaryKeys
				, name: 		resource.name
			});

			(rows || []).forEach(function(row){
				Object.defineProperty(row, '_isFromDB', {value:true});
				records.push(new resource.Model(row, resource.relatingSets));
			}.bind(this));

			return records;
		}

	});
}();