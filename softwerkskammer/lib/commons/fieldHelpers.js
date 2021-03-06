'use strict';
/* eslint no-underscore-dangle: 0 */

var _ = require('lodash');
var moment = require('moment-timezone');
var numeral = require('numeral');
numeral.language('de', require('numeral/languages/de'));
numeral.language('en-gb', require('numeral/languages/en-gb'));

module.exports = {
  isFilled: function (someValue) {
    return someValue !== undefined && someValue !== null && someValue !== 'undefined' &&
      (typeof someValue === 'string' ? someValue.trim().length > 0 : true);
  },

  valueOrFallback: function (value, fallback) {
    return this.isFilled(value) ? value : fallback;
  },

  removePrefixFrom: function (prefix, string) {
    var regexp = new RegExp('^' + prefix);
    return string ? string.replace(regexp, '') : null;
  },

  addPrefixTo: function (prefix, string, additionalPrefixToCheck) {
    if (string && !_.startsWith(string, prefix) && !_.startsWith(string, additionalPrefixToCheck)) {
      return prefix + string;
    }
    return string;
  },

  createLinkFrom: function (fieldArray) {
    return fieldArray.join('_').replace(/[ #,!?ßöäü:"']/g, '_');
  },

  replaceMailAddresses: function (text) {
    if (text) {
      return text.replace(/[\w.\-]+@[\w.\-]+\.[\w.\-]{2,3}(?!\w)/g, '...@...');
      // this means: some chars @ some chars . 2 or 3 chars, not followed by a char
      // where char = a-z A-Z 0-9 _ . -
    }
    return text;
  },

  replaceLongNumbers: function (text) {
    if (text) {
      return text.replace(/[\-+()\/\d][\-()\/\d\s]{4,}[\-()\/\d]/g, '...');
      // this means: first we need a number or + or - or ( or ) or /
      // then we need the same or space, at least four times
      // last we need a number or - or ( or ) or /
    }
    return text;
  },

  killHtmlHead: function (text) {
    if (text) {
      return text.replace(/<head>(?:\S|\s|\r)*<\/head>/, '');
    }
    return text;
  },

  readableDate: function (unixtimestamp) {
    return moment.unix(unixtimestamp).utc().format('DD.MM.YYYY');
  },

  parseToUnixUsingDefaultTimezone: function (dateString, timeString) {
    var result = this.parseToMomentUsingDefaultTimezone(dateString, timeString);
    return result ? result.unix() : undefined;
  },

  parseToMomentUsingDefaultTimezone: function (dateString, timeString) {
    return this.parseToMomentUsingTimezone(dateString, timeString, this.defaultTimezone());
  },

  parseToMomentUsingTimezone: function (dateString, timeString, timezoneName) {
    if (dateString) {
      var timeStringOrDefault = timeString || '00:00';
      return moment.tz(dateString + ' ' + timeStringOrDefault, 'D.M.YYYY H:m', timezoneName);
    }
  },

  defaultTimezone: function () {
    return 'Europe/Berlin';
  },

  formatNumberWithCurrentLocale: function (res, number) {
    return numeral.language(res.locals.language)(number).format('0.00');
  },

  parseNumberWithCurrentLocale: function (language, numberString) {
    return parseFloat(numberString.replace(',', '.'));
    // return numeral.language(language)().unformat(numberString);
  },

  roundNumber: function (number) {
    return numeral().unformat(numeral(number).format('0.00'));
  },

  containsSlash: function (string) {
    return (/\//).test(string);
  }

};
