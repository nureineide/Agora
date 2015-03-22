'use strict';

var _ = require('lodash');
var express = require('express');
var userStub = require('./userStub');
var i18n = require('i18next');
var jade = require('jade');

module.exports = function (internalAppName, configuredBeans) {
  var appName = internalAppName;
  var beans = configuredBeans || require('./configureForTest').get('beans');

  i18n.init({
    supportedLngs: ['de'],
    preload: ['de'],
    fallbackLng: 'de',
    resGetPath: 'locales/__ns__-__lng__.json'
  });

  return {
    createApp: function (params) {  //  add middleware list as dynamic params {middlewares: [userWithoutMember]}
      var app = express();
      app.locals.pretty = true;
      app.enable('view cache');
      app.use(require('cookie-parser')());
      app.use(require('body-parser').urlencoded({extended: true}));
      app.use(function (req, res, next) {
        res.locals.removeServerpaths = function (msg) { return msg; };
        next();
      });
      app.use(i18n.handle);
      app.use(beans.get('expressSessionConfigurator'));

      if (params && params.middlewares) {
        _.each(params.middlewares, function (middleware) {
          app.use(middleware);
        });
      }

      if (params && params.id) {
        var Member = beans.get('member');
        app.use(userStub({member: new Member({id: params.id})}));
      }
      if (params && params.member) {
        app.use(userStub({member: params.member}));
      }

      app.use(beans.get('accessrights'));
      app.use(beans.get('expressViewHelper'));
      app.use('/', beans.get(appName));

      var appLogger = { error: function () { return undefined; } };
      app.use(beans.get('handle404')(appLogger));
      app.use(beans.get('handle500')(appLogger));

      i18n.registerAppHelper(app);
      i18n.addPostProcessor('jade', function (val, key, opts) {
        return jade.compile(val, opts)();
      });
      return app;
    }
  };
};

