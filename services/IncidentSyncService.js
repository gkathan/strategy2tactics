/**
* service which syncs on a scheduled basis with the configured prioity  incidents from snow API
**/
var config = require('config');
var schedule = require('node-schedule');
var _ = require('lodash');
var moment = require('moment');

var mongojs = require("mongojs");
var DB="space";
var connection_string = '127.0.0.1:27017/'+DB;
var db = mongojs(connection_string, [DB]);

var jsondiffpatch=require('jsondiffpatch');

// logger
var winston = require('winston');
var logger = winston.loggers.get('space_log');

var app=require('../app');

exports.init = function(){
	var rule = new schedule.RecurrenceRule();
	// every 10 minutes
	rule.minute = new schedule.Range(0, 59, config.sync.incident.intervalMinutes);
	logger.info("[s p a c e] IncidentSyncService init(): "+config.sync.incident.intervalMinutes+" minutes - mode: "+config.sync.incident.mode);
	if (config.sync.incident.mode!="off"){
		var j = schedule.scheduleJob(rule, function(){
			logger.debug('...going to sync Incident stuff ....');
			var _url = config.sync.incident.url;

			_syncIncident(_url,function(data){
				logger.debug("** [DONE] incidentSync ");
			});
		});
	}
}

exports.sync = _syncIncident;

function _syncIncident(url,done){
	debugger;
	logger.debug("**** _syncIncident, url: "+url);
	//logger.debug("**** _syncIncident, req: "+req.baseUrl);

		var _secret = require("../config/secret.json");

		var options_auth={user:_secret.snowUser,password:_secret.snowPassword};
		logger.debug("snowUser: "+_secret.snowUser);

		var Client = require('node-rest-client').Client;
		client = new Client(options_auth);
		// direct way
		logger.debug("**** node rest client: "+client);

		/*
			Priority:
			Display Value	Actual Value
			P01 – Critical	1
			P08 – High	2
			P16 - Moderate	3
			P40 – Low	4
		*/
		url+="priority<="+config.sync.incident.includePriority;

		logger.debug("*** client.get data : url = "+url);


		client.get(url, function(data, response,callback){
			// parsed response body as js object
			logger.debug("...data:"+data);
			logger.debug("...response:"+response.records);

			logger.debug("arguments.callee.name: "+arguments.callee.name);
			logger.debug("[_syncIncident]...get data..: _url:"+url);
			//logger.debug("[_syncIncident]...get data..: data:"+JSON.stringify(data));

			var incidents =  db.collection('incidents');
			var incidentsdelta =  db.collection('incidentsdelta');

      var _incidentsNEW=[];
      var _incidentsOLD;

			// lets first get what we have had
			incidents.find({},function(err,baseline){
        _incidentsOLD = baseline;
			   // and store it

				incidents.drop();

				var _compareIncidents=[];
				var _compareIncidentsBaseline=[];

				for (var i in data.records){
					var _incident = _filterRelevantData(data.records[i]);
					_incidentsNEW.push(_incident);
					_compareIncidents.push(_filterRelevantDataForDiff(_incident));
				}

        var _diff;

				for (var o in _incidentsOLD){
					_compareIncidentsBaseline.push(_filterRelevantDataForDiff(_incidentsOLD[o]));
				}

        var _incidentsDELTA_CHANGED =[];
        for (var n in _incidentsNEW){
          var _sysId = _incidentsNEW[n].sysId;
          var _old = _.findWhere(_incidentsOLD,{"sysId":_sysId});

          var _changed={};
          if (_old){
            _diff=jsondiffpatch.diff(_filterRelevantDataForDiff(_old),_filterRelevantDataForDiff(_incidentsNEW[n]));
            if (_diff){
              var _change ={"id":_old.id,"sysId":_old.sysId,"diff":_diff}

              _incidentsDELTA_CHANGED.push(_change);
            }
          }
        }

        var _incidentsNEWSysIds = _.pluck(_incidentsNEW,'sysId');
        var _incidentsOLDSysIds = _.pluck(_incidentsOLD,'sysId');

        // and also check for new incidents !
        // lodash.difference
        // lodash.pick for reducing the object proerties
        // lodash.omit might be better...

        var _incidentsDELTASysIds = _.difference(_incidentsNEWSysIds,_incidentsOLDSysIds);

        logger.debug("OLD *************** "+_incidentsOLDSysIds);
        logger.debug("NEW *************** "+_incidentsNEWSysIds);

        logger.debug("DELTA *************** delta size: "+_incidentsDELTASysIds.length);

        var _incidentsDELTA_NEW =[];
        for (var d in _incidentsDELTASysIds){
          _incidentsDELTA_NEW.push(_.findWhere(_incidentsNEW,{"sysId":_incidentsDELTASysIds[d]}))
        }

        logger.debug("--------------------------------------------------- incidentsOLD: length="+_incidentsOLD.length);
        logger.debug("--------------------------------------------------- incidentsNEW: length="+_incidentsNEW.length);


        if (_incidentsDELTA_NEW.length>0 || _incidentsDELTA_CHANGED.length>0){
          var _incidentsDIFF={"createDate":new Date(),"NEW":_incidentsDELTA_NEW,"CHANGED":_incidentsDELTA_CHANGED}

          incidentsdelta.insert(_incidentsDIFF);
				  // and send a websocket event about the changes ;-)
					//[TODO]

					var _message={};
					var _type;
					var _prio;

					if (config.emit.snow_incidents_new =="on" && _incidentsDIFF.NEW.length>0){
						// for now we assume there is always only one new INCIDENT
						var _newincident = _incidentsDIFF.NEW[0];
						logger.debug("_newincident: "+JSON.stringify(_newincident));
						if (_.startsWith(_newincident.priority,"P01")){
							_type="error";
							_prio = "P1";
						}
						else if(_.startsWith(_newincident.priority,"P08")){
							_type="warning";
							_prio = "P8";
						}
						else if(_.startsWith(_newincident.priority,"P16")){
							_type="info";
							_prio = "P16";
						}
						else if(_.startsWith(_newincident.priority,"P40")){
							_type="info";
							_prio = "P40";
						}


						_message.title=_newincident.businessService;
						// TODO format nicely and link to snow


						_message.body = "+ "+_newincident.label+"\n"+_newincident.shortDescription;;
						_message.type = _type;
						_message.desktop={
							desktop:true,
							icon:"/images/incidents/"+_prio+".png"
						};
						app.io.emit('message', {msg:_message});
					}

					if (config.emit.snow_incidents_changes =="on" && _incidentsDIFF.CHANGED.length>0){
						_message.title="! INCIDENT CHANGES!";
						// TODO format nicely and link to snow


						_message.body = JSON.stringify(_incidentsDIFF.CHANGED);
						_message.type = "warning";
						_message.desktop={desktop:true};
						app.io.emit('message', {msg:_message});
					}
        }

				incidents.insert(_incidentsNEW	 , function(err , success){
					//console.log('Response success '+success);
					logger.debug('Response error '+err);
					if(success){
						logger.info("[success] sync incidents....length: "+_incidentsNEW.length);

							// get oldsnow data and merge it
							var incidenttrackeroldsnow =  db.collection('incidenttrackeroldsnow');
							incidenttrackeroldsnow.find({}, function(err , oldtrackerdata){

								if (oldtrackerdata){
									logger.debug("***** [yep] we got the old tracker data: length= "+oldtrackerdata.length);
									var _tracker = _calculateDailyTracker(_incidentsNEW,config.context);
									// and  handle incident tracker
									var incidenttracker =  db.collection('incidenttracker');
									incidenttracker.drop();
									incidenttracker.insert(oldtrackerdata.concat(_tracker)	 , function(err , success){
											if (err) logger.warn("[incidenttracker insert failed....]"+err.message);
											logger.info("[success] sync incidenttracker....length: "+_tracker.length);
									});
								}
							});
					}
				})
			})
			done(data);


		}).on('error',function(err){
        logger.error('[IncidentSyncSerice] says: something went wrong on the request', err.request.options);

				var _message={};
				_message.title="INCIDENT UPDATE FAILED";
				_message.body = "something went wrong on the request";

				app.io.emit('message', {msg:_message});

  });

}



function _pushEvent(event,message){
	exports.io.sockets.emit(event, message);
}

/**
* filters out the relevant attributes of the 87 fields from snow ;-)
*/
function _filterRelevantDataForDiff(incident){
	//_id, _syncDate
	delete incident._id;
	delete incident.syncDate;

	return incident;
}


/**
* filters out the relevant attributes of the 87 fields from snow ;-)
*/
function _filterRelevantData(data){

	var _incident={};
	_incident.location = data.location;
	_incident.context="bpty";
	_incident.impact = data.impact;
	_incident.urgency = data.urgency;
	_incident.description = data.description;
	_incident.priority = data.priority;
	_incident.closedAt = new moment(data.closed_at,"DD-MM-YYYY HH:mm:ss").toDate();
	_incident.resolvedAt = new moment(data.resolved_at,"DD-MM-YYYY HH:mm:ss").toDate();
	_incident.id = data.number;
	_incident.sysId = data.sys_id;
	_incident.label = data.u_label;
	_incident.businessService = data.u_business_service;
	if(data.u_sla_resolution_due_date) _incident.slaResolutionDate = new moment(data.u_sla_resolution_due_date,"DD-MM-YYYY HH:mm:ss").toDate();
	_incident.category = data.category;
	_incident.labelType = data.u_label_type;
	_incident.active = data.active;
	_incident.closeCode = data.u_close_code;
	_incident.assignmentGroup = data.assignment_group;
	_incident.environment = data.u_environment;
	_incident.state = data.state;
	_incident.openedAt = new moment(data.opened_at,"DD-MM-YYYY HH:mm:ss").toDate();
	_incident.shortDescription = data.short_description;
	_incident.notify = data.notify;
	_incident.problemId = data.problem_id;
	_incident.severity = data.severity;
	_incident.isMajorIncident = data.u_major_incident;
	_incident.createdBy = data.sys_created_by;
	_incident.contactType = data.contact_type;
	_incident.timeWorked = data.time_worked;
	_incident.syncDate = new Date();
	_incident.slaBreach = "";
	_incident.slaBreachTime = "";
	_incident.subCategory = data.subcategory;

	// an do some enriching.....
	if (data.state=="Resolved"){
		var _open = _incident.openedAt;
		var _resolved = _incident.resolvedAt;
		_incident.timeToResolve = _getTimeStringForTimeRange(_open,_resolved);

		if (_incident.slaResolutionDate && _resolved > _incident.slaResolutionDate){
			_incident.slaBreach = true;
			//logger.debug("################################## SLAB BREACH by  "+_time);
			_incident.slaBreachTime = _getTimeStringForTimeRange(_incident.slaResolutionDate,_resolved);
		}
		else if (_incident.slaResolutionDate && _resolved <= _incident.slaResolutionDate){
			_incident.slaBreach = false;
		}
	}

	if (data.state=="Closed"){
		var _open = _incident.openedAt;
		var _closed = _incident.closedAt;
		_incident.timeToClose = _getTimeStringForTimeRange(_open,_closed);

		if (_incident.slaResolutionDate && _closed > _incident.slaResolutionDate){
			_incident.slaBreach = true;
			//logger.debug("################################## SLAB BREACH by  "+_time);
			_incident.slaBreachTime = _getTimeStringForTimeRange(_incident.slaResolutionDate,_closed);
		}
		else if (_incident.slaResolutionDate && _closed <= _incident.slaResolutionDate){
			_incident.slaBreach = false;
		}
	}
	return _incident;
}

function _getTimeStringForTimeRange(start,stop){
	var ms = moment(stop,"DD/MM/YYYY HH:mm:ss").diff(moment(start,"DD/MM/YYYY HH:mm:ss"));
	var d = moment.duration(ms);
	var _time = Math.floor(d.asHours()) + moment.utc(ms).format(":mm:ss");
	return _time;
}


function _getData(url,priority,date,callback){
		var Client = require('node-rest-client').Client;
		client = new Client();
		// direct way

		url+="priority<="+priority+"^opened_at>"+date;

		logger.debug("*** client.get data : url = "+url);


		client.get(url, function(data, response,callback){
			// parsed response body as js object
			logger.debug("...data:"+data);
			logger.debug("...response:"+response.records);

			logger.debug("...get data..: _url:"+url);
			callback(data);
		})
}


/**
* param data list of incident objects
* calculates the daily number of incidents types
* and updates the incidentracker collection
*/
function _calculateDailyTracker(data,context){
	var _dailytracker = [];
	for (var i in data){
		//openedAt date is what we look at
		var _day = moment(data[i].openedAt).format("YYYY-MM-DD");
		_day = new Date(_day);

		if (!_.findWhere(_dailytracker,{"date":_day})) {
			_dailytracker.push({"date":_day,"P1":0,"P8":0,"context":context});
		}

		if (data[i].priority=="P01 - Critical"){
			_.findWhere(_dailytracker,{"date":_day}).P1++;
		}
		else if (data[i].priority=="P08 - High"){
			_.findWhere(_dailytracker,{"date":_day}).P8++;
		}


	}
	return _dailytracker;
}
