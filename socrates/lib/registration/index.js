'use strict';
var moment = require('moment-timezone');
var _ = require('lodash');
var async = require('async');

var conf = require('simple-configure');
var beans = conf.get('beans');
var misc = beans.get('misc');
var memberstore = beans.get('memberstore');
var Member = beans.get('member');
var subscriberstore = beans.get('subscriberstore');
var activitiesService = beans.get('activitiesService');
var subscriberService = beans.get('subscriberService');
var registrationService = beans.get('registrationService');
var icalService = beans.get('icalService');
var activitystore = beans.get('activitystore');
var statusmessage = beans.get('statusmessage');
var memberSubmitHelper = beans.get('memberSubmitHelper');
var socratesConstants = beans.get('socratesConstants');
var Addon = beans.get('socratesAddon');
var Participation = beans.get('socratesParticipation');
var roomOptions = beans.get('roomOptions');
var managementService = beans.get('managementService');
var currentUrl = beans.get('socratesConstants').currentUrl;

var app = misc.expressAppIn(__dirname);

function registrationOpening() {
  return moment(conf.get('registrationOpensAt'));
}

function isRegistrationOpen(registrationParam) {
  return registrationOpening().isBefore(moment())
    || (registrationParam && registrationParam === conf.get('registrationParam'));
}

function registrationOpensIn() {
  var registrationOpeningTime = registrationOpening();
  var reference = moment();
  if (registrationOpeningTime.isAfter(reference)) {
    var inDays = registrationOpeningTime.diff(reference, 'days');
    var inHours = registrationOpeningTime.diff(reference.add(inDays, 'days'), 'hours');
    var inMinutes = registrationOpeningTime.diff(reference.add(inHours, 'hours'), 'minutes');
    return {days: inDays, hours: inHours, minutes: inMinutes};
  }
  return undefined;
}

app.get('/', function (req, res, next) {
  activitiesService.getActivityWithGroupAndParticipants(socratesConstants.currentUrl, function (err, activity) {
    if (err || !activity) { return next(err); }
    var options = roomOptions.all(activity, res.locals.accessrights.memberId(), isRegistrationOpen(req.query.registration));

    res.render('get', {
      activity: activity,
      roomOptions: options,
      registration: {
        isPossible: isRegistrationOpen(req.query.registration),
        queryParam: req.query.registration,
        alreadyRegistered: activity.isAlreadyRegistered(res.locals.accessrights.memberId()),
        alreadyOnWaitinglist: activity.isAlreadyOnWaitinglist(res.locals.accessrights.memberId()),
        opening: registrationOpening(),
        opensIn: registrationOpensIn()
      }
    });
  });
});

app.get('/ical', function (req, res, next) {
  function sendCalendarStringNamedToResult(ical, filename, localRes) {
    localRes.type('text/calendar; charset=utf-8');
    localRes.header('Content-Disposition', 'inline; filename=' + filename + '.ics');
    localRes.send(ical.toString());
  }

  activitystore.getActivity(socratesConstants.currentUrl, function (err, activity) {
    if (err || !activity) { return next(err); }
    activity.state.description = '';
    sendCalendarStringNamedToResult(icalService.activityAsICal(activity), activity.url(), res);
  });
});

app.get('/interested', function (req, res) {
  res.render('iAmInterested');
});

app.post('/startRegistration', function (req, res, next) {
  if (!isRegistrationOpen(req.body.registrationParam) || !req.body.nightsOptions) { return res.redirect('/registration'); }
  var option = req.body.nightsOptions.split(',');
  var registrationTuple = {
    activityUrl: socratesConstants.currentUrl,
    resourceName: option[0],
    duration: option[1],
    sessionID: req.sessionID
  };
  var participateURL = '/registration/participate';
  req.session.registrationTuple = registrationTuple;
  registrationService.startRegistration(registrationTuple, function (err, statusTitle, statusText) {
    if (err) { return next(err); }
    if (statusTitle && statusText) {
      statusmessage.errorMessage(statusTitle, statusText).putIntoSession(req);
      return res.redirect('/registration');
    }
    if (!req.user) {
      req.session.returnToUrl = participateURL;
      return res.render('loginForRegistration', {returnToUrl: participateURL});
    }
    res.redirect(participateURL);
  });
});

app.get('/participate', function (req, res, next) {
  var registrationTuple = req.session.registrationTuple;
  if (!registrationTuple) { return res.redirect('/registration'); }
  if (!req.user) { return res.redirect('/registration'); }
  var member = req.user.member || new Member().initFromSessionUser(req.user, true);

  activitiesService.getActivityWithGroupAndParticipants(socratesConstants.currentUrl, function (err, activity) {
    if (err || !activity) { return next(err); }
    if (activity.isAlreadyRegistered(member.id())) {
      statusmessage.successMessage('general.info', 'activities.already_registered').putIntoSession(req);
      return res.redirect('/registration');
    }
    subscriberstore.getSubscriber(member.id(), function (err1, subscriber) {
      if (err1) { return next(err1); }
      var addon = (subscriber && subscriber.addon()) || new Addon({});
      var participation = (subscriber && subscriber.currentParticipation()) || new Participation();
      var expiresAt = activity.expirationTimeOf(registrationTuple);
      res.render('participate', {
        member: member,
        addon: addon,
        participation: participation,
        registrationTuple: registrationTuple,
        expiresIn: expiresAt && expiresAt.diff(moment(), 'minutes'),
        expiresAt: expiresAt
      });
    });
  });
});

app.post('/completeRegistration', function (req, res, next) {
  memberSubmitHelper(req, res, next, function (err) {
    if (err) { return next(err); }
    var body = req.body;
    registrationService.saveRegistration(req.user.member.id(), req.sessionID, body, function (err1, statusTitle, statusText) {
      if (err1) { return next(err1); }
      delete req.session.statusmessage;
      delete req.session.registrationTuple;
      if (statusTitle && statusText) {
        statusmessage.errorMessage(statusTitle, statusText).putIntoSession(req);
        return res.redirect('/registration');
      }
      if (body.duration === 'waitinglist') {
        statusmessage.successMessage('general.info', 'activities.successfully_added_to_waitinglist').putIntoSession(req);
        res.redirect('/registration');
      } else {
        statusmessage.successMessage('general.info', 'activities.successfully_registered').putIntoSession(req);
        res.redirect('/payment/socrates');
      }
    });
  });
});

// for management tables:

app.get('/management', function (req, res, next) {
  if (!res.locals.accessrights.canEditActivity()) {
    return res.redirect('/registration');
  }

  activitiesService.getActivityWithGroupAndParticipants(currentUrl, function (err, activity) {
    if (err) { return next(err); }
    managementService.addonLinesOf(activity.participants, function (err1, addonLines) {
      if (err1) { return next(err1); }

      var formatDates = function (dates) {
        return _(dates).map(function (date) { return date.locale('de').format('L'); }).uniq().value();
      };
      var formatList = function (list) {
        return list.join(', ');
      };

      activity.waitinglistMembers = {};

      function membersOnWaitinglist(act, resourceName, globalCallback) {
        async.map(act.resourceNamed(resourceName).waitinglistEntries(),
          function (entry, callback) {
            memberstore.getMemberForId(entry.registrantId(), function (err2, member) {
              if (err2 || !member) { return callback(err2); }
              member.addedToWaitinglistAt = entry.registrationDate();
              callback(null, member);
            });
          },
          function (err2, results) {
            if (err2) { return next(err2); }
            act.waitinglistMembers[resourceName] = _.compact(results);
            globalCallback();
          });
      }

      async.each(activity.resourceNames(),
        function (resourceName, callback) { membersOnWaitinglist(activity, resourceName, callback); },
        function (err2) {
          if (err2) { return next(err2); }

          var waitinglistMembers = [];
          _.each(activity.resourceNames(), function (resourceName) {
            waitinglistMembers.push(activity.waitinglistMembers[resourceName]);
          });

          managementService.addonLinesOf(_.flatten(waitinglistMembers), function (err3, waitinglistLines) {
            if (err3 || !waitinglistLines) { return next(err3); }

            subscriberService.getMembersAndSubscribersForIds(activity.rooms('bed_in_double').participantsWithoutRoom(), function (errA, unpairedDoubleParticipants) {
              if (errA) { return next(errA); }
              subscriberService.getMembersAndSubscribersForIds(activity.rooms('bed_in_junior').participantsWithoutRoom(), function (errB, unpairedJuniorParticipants) {
                if (errB) { return next(errB); }
                subscriberService.getMembersAndSubscribersForIds(activity.rooms('bed_in_double').participantsInRoom(), function (errC, pairedDoubleParticipants) {
                  if (errC) { return next(errC); }
                  subscriberService.getMembersAndSubscribersForIds(activity.rooms('bed_in_junior').participantsInRoom(), function (errD, pairedJuniorParticipants) {
                    if (errD) { return next(errD); }
                    /* eslint camelcase: 0 */
                    res.render('managementTables', {
                      activity: activity,
                      addonLines: addonLines,
                      waitinglistLines: waitinglistLines,
                      addonLinesOfUnsubscribedMembers: [],
                      tshirtsizes: managementService.tshirtSizes(addonLines),
                      durations: managementService.durations(activity),
                      rooms: {
                        bed_in_double: {
                          unpairedParticipants: unpairedDoubleParticipants,
                          roomPairs: activity.rooms('bed_in_double').roomPairsWithMembersFrom(pairedDoubleParticipants)
                        },
                        bed_in_junior: {
                          unpairedParticipants: unpairedJuniorParticipants,
                          roomPairs: activity.rooms('bed_in_junior').roomPairsWithMembersFrom(pairedJuniorParticipants)
                        }
                      },
                      formatDates: formatDates,
                      formatList: formatList
                    });
                  });
                });
              });
            });
          });
        });

    });
  });
});

module.exports = app;
