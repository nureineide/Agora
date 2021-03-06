'use strict';
var conf = require('simple-configure');
var Member = conf.get('beans').get('member');

module.exports = function accessrights(req, res, next) {
  res.locals.accessrights = {
    req: req,

    member: function () {
      return this.req.user && this.req.user.member;
    },

    isRegistered: function () {
      return !!this.member();
    },

    memberId: function () {
      return this.isRegistered() ? this.member().id() : null;
    },

    isMember: function (member) {
      return this.isRegistered() && this.memberId() === member.id();
    },

    isSuperuser: function () {
      return Member.isSuperuser(this.memberId()); // same superusers as in SWK
    },

    isSoCraTesAdmin: function () {
      return this.isRegistered() && conf.get('socratesAdmins').indexOf(this.memberId()) > -1;
    },

    canEditMember: function (member) {
      return this.isMember(member);
    },

    canDeleteMember: function (member) {
      return this.isSuperuser() && !this.isMember(member);
    },

    canCreateActivity: function () {
      return this.isSuperuser();
    },

    canEditActivity: function () {
      return this.isSuperuser() || this.isSoCraTesAdmin();
    },

    canDeleteActivity: function () {
      return this.isSuperuser();
    }

  };
  next();
};
