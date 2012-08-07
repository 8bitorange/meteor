if (!Meteor.accounts)
  Meteor.accounts = {};

if (!Meteor.accounts.urls)
  Meteor.accounts.urls = {};

Meteor.accounts.urls.resetPassword = function (baseUrl, token) {
  return baseUrl + '#?reset-password/' + token;
};

Meteor.accounts.urls.validateEmail = function (baseUrl, token) {
  return baseUrl + '#?validate-email/' + token;
};

// xcxc bug: user with email but no username doesn't show name in accounts-ui

// xcxc server-side validate url scheme
// we we listen on a middleware and set a flag on the user object:
// - verified: true
// - justVerified: true (name??)
//
// then accounts-ui shows an overlay message thingy iff justVerified with a "hide"
// button hiding it
//
// only (?) weirdness is that it shows on all tabs whereas this
// current solution shows it only in the tab you clicked on.
