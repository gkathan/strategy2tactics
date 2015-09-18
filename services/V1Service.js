/**
 * V1Service encapsulated fucntionality
 */
var config = require('config');
var mongojs = require("mongojs");

var _ = require('lodash');

var DB="space";

var connection_string = '127.0.0.1:27017/'+DB;
var db = mongojs(connection_string, [DB]);

var winston=require('winston');
var logger = winston.loggers.get('space_log');

exports.findEpics=_findEpics;
exports.findTeams=_findTeams;
exports.findBacklogs=_findBacklogs;
exports.findMembers=_findMembers;

exports.findEpicsWithChildren=_findEpicsWithChildren;
exports.findInitiativesWithPlanningEpics = _findInitiativesWithPlanningEpics;
exports.findInitiativeEpics=_findInitiativeEpics;
exports.findPortfolioApprovalEpics=_findPortfolioApprovalEpics;
exports.getRoadmapInitiatives=_getRoadmapInitiatives;
exports.getRoot=_getRoot;
exports.getPlanningEpics=_getPlanningEpics;
exports.getBacklogsFromInitiativesWithPlanningEpics=_getBacklogsFromInitiativesWithPlanningEpics;
exports.getMembersPerPlanningBacklog = _getMembersPerPlanningBacklog;


/**
 * find all Epics
 */
function _findEpics(callback) {
	var epics =  db.collection('v1epics');
		epics.find({}, function (err, docs){
			//sort
			var _e =_.sortBy(docs, "Number")
			callback(err,_e);
			return;
	});
}
/**
 * find all Teams
 */
function _findTeams(filter,callback) {
	var teams =  db.collection('v1teams');
		teams.find(filter, function (err, result){
			callback(err,result);
			return;
	});
}

/**
 * find all Members
 */
function _findMembers(filter,callback) {
	var members =  db.collection('v1members');
		members.find(filter, function (err, result){
			callback(err,result);
			return;
	});
}


/**
 * find all Backlogs
 */
function _findBacklogs(filter,callback) {
	var backlogs =  db.collection('v1backlogs');
		backlogs.find(filter, function (err, result){
			callback(err,result);
			return;
	});
}

/**
 * find all Programs
 */
function _findPrograms(filter,callback) {
	var programs =  db.collection('v1programs');
		backlogs.find(filter, function (err, result){
			callback(err,result);
			return;
	});
}



function _findEpicsWithChildren(filter,callback) {
	var epics =  db.collection('v1epics');
		epics.find(filter, function (err, epics){
			logger.debug("============= _findEpicsWithChildren - found: "+epics.length+ " epics for: "+JSON.stringify(filter));
			for (var e in epics){
				if (epics[e].EpicRootNumber){
					var _e=_.findWhere(epics,{"Number":epics[e].EpicRootNumber});
					if (_e && !_e.Children) _e.Children =[];
					if (_e) _e.Children.push(epics[e]);
				}
			}
			callback(err,epics);
			return;
	});
}


/** this is for peter :-)
* collects all initiatives and puts planning epics as children*
*/
// ,{"PortfolioApproval":"Yes"}
function _findInitiativesWithPlanningEpics(filter,callback){
	//var _prefilter = {$and:[{$or:[{CategoryName:"Initiative"},{CategoryName:"Planning"}]},{$or:[{Status:"Conception"},{Status:"Understanding"},{Status:"Implementation"}]},{"PortfolioApproval":"Yes"}]};
	//var _prefilter = {$and:[{$or:[{CategoryName:"Initiative"},{CategoryName:"Planning"},{CategoryName:"Product Contribution"}]},{$or:[{Status:"Conception"},{Status:"Understanding"},{Status:"Implementation"}]}]};
	var _prefilter = {$and:[{$or:[{CategoryName:"Initiative"},{CategoryName:"Planning"},{CategoryName:"Product Contribution"}]},{IsClosed:false}]};
	//var _prefilter={};
	_findEpicsWithChildren(_prefilter,function(err,epics){

		var _initiatives = [];

		for (var e in epics){
			var _e = epics[e];
			if (_e.EpicRootNumber){
				// needs to be recusrsive.....
				var _root = _getRoot(epics,_e.Number)
				if (_root && !_.findWhere(_initiatives,{Number:_root.Number})){
					_initiatives.push(_root);
				}
			}
			else if (!_.findWhere(_initiatives,{Number:_e.Number})){
				_initiatives.push(_e);
			}
		}
		var _cleaned = [];
		// and now we flatten to "Planning Epics" as children only
		for (var i in _initiatives){
			if (_initiatives[i].Status=="Conception" || _initiatives[i].Status=="Understanding" || _initiatives[i].Status=="Implementation"){
				_initiatives[i].PlanningEpics = _getPlanningEpics(_initiatives[i]);
				_cleaned.push(_initiatives[i]);
			}
		}
		callback(err,_.where(_cleaned,{PortfolioApproval:"Yes"}));
	})
}



/** extracts the backlog field and groups around this
*/
function _getBacklogsFromInitiativesWithPlanningEpics(initiativesWithPlanningEpics){
	var _backlogs = [];
	_backlogs = _extractBacklogs(initiativesWithPlanningEpics);
	_backlogs = _repopulateBacklogs(_backlogs,initiativesWithPlanningEpics);
	_backlogs = _filterPlanningEpics(_backlogs);
	return _backlogs;
}

function _extractBacklogs(initiativesWithPlanningEpics){
	var _backlogs = [];
	// first lets build up the distinct backlog collection
	for (var i in initiativesWithPlanningEpics){
		var _i = initiativesWithPlanningEpics[i];
		if (_i.PlanningEpics){
			for (var p in _i.PlanningEpics){
				var _p = _i.PlanningEpics[p];
				if (!_.findWhere(_backlogs,{Name:_p.BusinessBacklog})){
					_backlogs.push({Name:_p.BusinessBacklog,Initiatives:[]})
				}
			}
		}
	}
	return _backlogs;
}

function _repopulateBacklogs(backlogs,initiativesWithPlanningEpics){
	// now put the initiatives back in
	for (var b in backlogs){
		var _b = backlogs[b];
		for (var i in initiativesWithPlanningEpics){
			var _i = initiativesWithPlanningEpics[i];
			if (_i.PlanningEpics){

				for (var p in _i.PlanningEpics){
					var _p = _i.PlanningEpics[p];
					if (_p.BusinessBacklog==_b.Name){
						if (!_.findWhere(_b.Initiatives,{Name:_i.Name})){

							_b.Initiatives.push(_.cloneDeep(_i));
						}
					}
				}
			}
		}
	}
	return backlogs;
}

function _filterPlanningEpics(backlogs){
	// and filter planning epics
	for (var b in backlogs){
		var _b = backlogs[b];
		for (var i in _b.Initiatives){
			var _i = _b.Initiatives[i];
			var _filtered=[];
			if (_i.PlanningEpics){
				for (var p in _i.PlanningEpics){
					var _p = _i.PlanningEpics[p];
					if (_p.BusinessBacklog == _b.Name){
						_filtered.push(_p);
					}
				}
				if (_filtered.length>0){
					_i.PlanningEpics=_filtered;
				}
			}
		}
	}
	return backlogs;
}


function _getRoot(epics,number){
	var _e = _.findWhere(epics,{Number:number});
	if (!_e) return;
	if (_e.EpicRootNumber){
		return _getRoot(epics,_e.EpicRootNumber)
	}
	else{
		return _e;
	}
}

/** collects all epics type Planning in a parent child three
*  TODO recursive
*/
function _getPlanningEpics(epic){
	var _planningepics=[];
	if (epic.Children){
		for (var c in epic.Children){
			var _child = epic.Children[c];
			if (_child.CategoryName==="Planning" && !_child.Children){
				if (_child.BusinessBacklog.indexOf("#cpb")>-1)
					_planningepics.push(_child);
			}
			else if (_child.Children){
				for (var cc in _child.Children){
					var _ccchild = _child.Children[cc];
					if (_ccchild.CategoryName==="Planning"){
						if (_ccchild.BusinessBacklog.indexOf("#cpb")>-1)
							_planningepics.push(_ccchild);
					}
				}
			}
		}
	}
	return _.sortBy(_planningepics,'BusinessBacklog');
}


function _findInitiativeEpics(callback) {
	var epics =  db.collection('v1epics');
		epics.find({}, function (err, docs){
			//sort
			var _e =_.sortBy(_.where(docs,{CategoryName:"Initiative"}), "Number")
			callback(err,_e);
			return;
	});
}


function _findPortfolioApprovalEpics(callback) {
	var epics =  db.collection('v1epics');
		epics.find({}, function (err, docs){
			//sort
			var _e =_.sortBy(_.where(docs,{PortfolioApproval:"Yes"}), "Number")
			callback(err,_e);
			return;
	});
}

function _getRoadmapInitiatives(start,callback){
	_findInitiativeEpics(function (err,initiatives){
		var _roadmap = [];
		for (var i in initiatives){
			var _in=initiatives[i];
			if (new Date(_in.PlannedStart)>=start && _in.Product) _roadmap.push(_in);
		}
		callback(err,_roadmap);
	});
}


function _getMembersPerPlanningBacklog(backlog,teams,members){
	var _membersPerBacklog=[];
	var _teams = _.where(teams,{Backlog:backlog});

	for (var t in _teams){
		var _t = _teams[t];
		var _participants=_parseParticipants(_t.Participants,members);
		for (var p in _participants){
			_participants[p].Team=_t.Name;
			var _p = _.findWhere(_membersPerBacklog,{ID:_participants[p].ID});
			if (!_p) _membersPerBacklog.push(_participants[p]);
		}
	}
	return _membersPerBacklog;
}

/**
parse from V1 participant string
[{_oid\u003dMember:66587}, {_oid\u003dMember:461706}, {_oid\u003dMember:860049}, {_oid\u003dMember:2797134}, {_oid\u003dMember:2829866}
*/
function _parseParticipants(participantString,members){
	var _participants = [];
	// omit starting and ending bracket
	var _slices = _.initial(_.rest(participantString).join("")).join("").split(", ");
	for (var s in _slices){
		// the oid
		var _oid = _.initial(_slices[s].split(":")[1]).join("");
		var _member = _.findWhere(members,{ID:"Member:"+_oid});
		if (_member){
			_participants.push(_member);
		}
	}
	return _participants;
}

/**
 * @param epicRef E-08383 format
 */
exports.findEpicByRef = function(epicRef,callback) {
	var epics =  db.collection('v1epics');
	epics.find( function(err , docs){
			var _e =docs;
			for (var i in _e){
				if (_e[i].Number==epicRef){
					var _epic = _e[i];
					callback(_epic);
					return;
				}
			}
	});
	return;
}
