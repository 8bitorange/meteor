/////////// XXX old tests to old API are completely broken
var notest = function() {};

var dump_frag = function (frag) {
  var ret = '';

  var dump_children = function (node) {
    for (var child = node.firstChild; child; child = child.nextSibling)
      dump(child);
  };

  var dump = function (node) {
    if (node.nodeType === 8) /* comment */
      ret += "<!---->";
    else if (node.nodeType === 3) { /* text */
      // strip whitespace. note, no entity escaping
      ret += node.nodeValue.replace(/^\s+|\s+$/g, "");
    }
    else {
      ret += '<' + node.id + '>';
      dump_children(node);
      ret += '</' + node.id + '>';
    }
  };

  dump_children(frag);
  return ret;
};

// if passed a node instead of a fragment, dump its children. turns
// out to be handy.
//
// if expected includes '~', it will be interpreted to mean "either
// <!----> or nothing". this is useful because LiveRange is sometimes
// forced to insert placeholder comments on older versions of IE.
var assert_frag = function (expected, actual_frag) {
  var expected1 = expected.replace(/~/g, "");
  var expected2 = expected.replace(/~/g, "<!---->");
  var actual = dump_frag(actual_frag);

  if (actual === expected1)
    test.ok();
  else if (actual === expected2)
    test.ok();
  else
    assert.equal(actual, expected, "Fragment doesn't match pattern");

  if (actual.firstChild) {
    var range = new Meteor.ui._LiveUIRange(actual);
    check_liverange_integrity(range);
    range.destroy();
  }
};

var weather = {here: "cloudy", there: "cloudy"};
var weather_listeners = {here: {}, there: {}};
var get_weather = function (where) {
  var context = Meteor.deps.Context.current;
  if (context && !(context.id in weather_listeners[where])) {
    weather_listeners[where][context.id] = context;
    context.on_invalidate(function (old_context) {
      delete weather_listeners[where][old_context.id];
    });
  }
  return weather[where];
};
var set_weather = function (where, what) {
  weather[where] = what;
  for (var id in weather_listeners[where])
    weather_listeners[where][id].invalidate();
};

  // XXX SECTION: LiveUI

notest("render - coercion", function () {

  assert_frag("<a></a>", Meteor.ui.render(function () {
    return DIV({id: "a"});
  }));

  assert_frag("<b></b><c></c>", Meteor.ui.render(function () {
    var f = document.createDocumentFragment();
    f.appendChild(DIV({id: "b"}));
    f.appendChild(DIV({id: "c"}));
    return f;
  }));

  assert_frag("<d></d><e></e>", Meteor.ui.render(function () {
    return [
      DIV({id: "d"}),
      DIV({id: "e"})
    ];
  }));

  assert_frag("<f></f><g></g>", Meteor.ui.render(function () {
    return $('<div id="f"></div><div id="g"></div>');
  }));

  assert_frag("~hi~", Meteor.ui.render(function () {
    return document.createTextNode("hi");
  }));

  assert_frag("~igloo~", Meteor.ui.render(function () {
    return "igloo";
  }));

  assert_frag("<!---->", Meteor.ui.render(function () {
    return document.createComment('');
  }));
});

notest("render - updating and GC", function () {
  set_weather("here", "cloudy");
  assert.length(_.keys(weather_listeners.here), 0);
  var r = Meteor.ui.render(function () {
    return get_weather("here");
  });
  assert.length(_.keys(weather_listeners.here), 1);
  assert_frag("~cloudy~", r);

  set_weather("here", "icy");
  assert.length(_.keys(weather_listeners.here), 1);
  assert_frag("~cloudy~", r);
  Meteor.flush(); // not onscreen -- gets GC'd
  assert.length(_.keys(weather_listeners.here), 0);
  assert_frag("~cloudy~", r);

  r = Meteor.ui.render(function () {
    return get_weather("here");
  });
  var onscreen = DIV({style: "display: none;"});
  onscreen.appendChild(r);
  document.body.appendChild(onscreen);

  assert_frag("~icy~", onscreen);
  assert.length(_.keys(weather_listeners.here), 1);

  set_weather("here", "vanilla");
  assert.length(_.keys(weather_listeners.here), 1);
  assert_frag("~icy~", onscreen);
  Meteor.flush();
  assert.length(_.keys(weather_listeners.here), 1);
  assert_frag("~vanilla~", onscreen);

  document.body.removeChild(onscreen);
  Meteor.flush();
  assert.length(_.keys(weather_listeners.here), 1);

  set_weather("here", "curious"); // safe from GC until flush
  document.body.appendChild(onscreen);
  Meteor.flush();
  assert.length(_.keys(weather_listeners.here), 1);
  assert_frag("~curious~", onscreen);

  document.body.removeChild(onscreen);
  set_weather("here", "penguins");
  assert.length(_.keys(weather_listeners.here), 1);
  assert_frag("~curious~", onscreen);
  Meteor.flush();
  assert.length(_.keys(weather_listeners.here), 0);
  assert_frag("~curious~", onscreen);
});

notest("render - recursive", function () {
  set_weather("here", "penguins");
  set_weather("there", "wet");

  var outer_count = 0;
  var inner_count = 0;
  var onscreen = DIV({style: "display: none;"}, [
    Meteor.ui.render(function () {
      outer_count++;
      return DIV({id: "outer"}, [get_weather("here"),
                  Meteor.ui.render(function () {
                    inner_count++;
                    return get_weather("there");
                  })
                 ]);
    })
  ]);
  document.body.appendChild(onscreen);
  assert_frag("<outer>penguins~wet~</outer>", onscreen);
  assert.equal(outer_count, 1);
  assert.equal(inner_count, 1);
  assert.length(_.keys(weather_listeners.here), 1);
  assert.length(_.keys(weather_listeners.there), 1);

  set_weather("there", "dry");
  Meteor.flush();
  assert_frag("<outer>penguins~dry~</outer>", onscreen);
  assert.equal(outer_count, 1);
  assert.equal(inner_count, 2);
  assert.length(_.keys(weather_listeners.here), 1);
  assert.length(_.keys(weather_listeners.there), 1);

  set_weather("here", "chocolate");
  Meteor.flush();
  assert_frag("<outer>chocolate~dry~</outer>", onscreen);
  assert.equal(outer_count, 2);
  assert.equal(inner_count, 3);
  assert.length(_.keys(weather_listeners.here), 1);
  assert.length(_.keys(weather_listeners.there), 1); // XXX FAILS

  document.body.removeChild(onscreen);
  set_weather("there", "melting"); // safe from GC until flush
  assert.length(_.keys(weather_listeners.here), 1);
  assert.length(_.keys(weather_listeners.there), 1);
  document.body.appendChild(onscreen);
  try {
    Meteor.flush();
    assert_frag("<outer>chocolate~melting~</outer>", onscreen);
    assert.equal(outer_count, 2);
    assert.equal(inner_count, 4);
    assert.length(_.keys(weather_listeners.here), 1);
    assert.length(_.keys(weather_listeners.there), 1);
  } finally {
    document.body.removeChild(onscreen);
  }
  set_weather("here", "silent");
  Meteor.flush();
  assert_frag("<outer>chocolate~melting~</outer>", onscreen);
  assert.equal(outer_count, 2);
  assert.equal(inner_count, 4);
  assert.length(_.keys(weather_listeners.here), 0);
  assert.length(_.keys(weather_listeners.there), 0);
});

notest("render - events", function () {
  var evts = '';
  var onscreen = DIV({style: "display: none;"}, [
    Meteor.ui.render(function () {
      return [
        Meteor.ui.render(function () {
          get_weather("there");
          return DIV({id: "wrapper"}, [
            DIV({id: "outer"}, [
              DIV({id: "inner1"}),
              Meteor.ui.render(function () {
                return DIV({id: "inner2"});
              })
            ])]);
        }),
        Meteor.ui.render(function () {
          if (get_weather("here") !== "expansive")
            return [];
          return DIV({id: "wrapper2"}, [
            DIV({id: "outer2"}, [
              DIV({id: "inner21"}),
              Meteor.ui.render(function () {
                return DIV({id: "inner2"});
              })
            ])
          ]);
        })
      ];
    }, {
      "click": function (e) {
        assert.equal(12, this.x);
        evts += "a" + e.originalEvent.data;
      },
      "mousedown #outer": function (e) {
        assert.equal(12, this.x);
        evts += "b" + e.originalEvent.data;
      },
      "mouseup #inner1": function (e) {
        assert.equal(12, this.x);
        evts += "c1" + e.originalEvent.data;
      },
      "mouseup #inner2": function (e) {
        assert.equal(12, this.x);
        evts += "c2" + e.originalEvent.data;
      },
      "keypress, keydown #inner2": function (e) {
        assert.equal(12, this.x);
        evts += "de" + e.originalEvent.data;
      },
      "keyup #wrapper": function (e) {
        assert.equal(12, this.x);
        evts += "f" + e.originalEvent.data;
      }
    }, {x : 12})
  ]);
  document.body.appendChild(onscreen);

  var simulate = function (node, event, args) {
    node = (node instanceof $ ? node[0] : node);

    if (document.createEvent) {
      var e = document.createEvent("Event");
      e.initEvent(event, true, true);
      _.extend(e, args);
      node.dispatchEvent(e);
    } else {
      var e = document.createEventObject();
      _.extend(e, args);
      node.fireEvent("on" + event, e);
    }
  };

  var test_event = function (expected, id, event, args) {
    evts = "";
    simulate($('#' + id), event, args);
    assert.equal(evts, expected);
  }

  var main_event_tests = function () {
    test_event('a0', 'inner1', 'click', {data: 0});
    test_event('a1', 'inner2', 'click', {data: 1});
    test_event('a2', 'outer', 'click', {data: 2});
    test_event('a3', 'wrapper', 'click', {data: 3});
    test_event('b4', 'inner1', 'mousedown', {data: 4});
    test_event('b5', 'inner2', 'mousedown', {data: 5});
    test_event('b6', 'outer', 'mousedown', {data: 6});
    test_event('', 'wrapper', 'mousedown', {data: 7});
    test_event('c18', 'inner1', 'mouseup', {data: 8});
    test_event('c29', 'inner2', 'mouseup', {data: 9});
    test_event('', 'outer', 'mouseup', {data: 10});
    test_event('', 'wrapper', 'mouseup', {data: 11});
    test_event('de12', 'inner1', 'keypress', {data: 12});
    test_event('de13', 'inner2', 'keypress', {data: 13});
    test_event('de14', 'outer', 'keypress', {data: 14});
    test_event('de15', 'wrapper', 'keypress', {data: 15});
    test_event('', 'inner1', 'keydown', {data: 16});
    test_event('de17', 'inner2', 'keydown', {data: 17});
    test_event('', 'outer', 'keydown', {data: 18});
    test_event('', 'wrapper', 'keydown', {data: 19});
    test_event('', 'inner1', 'keyup', {data: 20});
    test_event('', 'inner2', 'keyup', {data: 21});
    test_event('', 'outer', 'keyup', {data: 22});
    // XXX expected failure -- selectors will never match top-level nodes
    test.expect_fail();
    test_event('f23', 'wrapper', 'keyup', {data: 23});
  };
  main_event_tests();

  set_weather("here", "expansive");
  Meteor.flush();
  main_event_tests();

  // XXX expected failure -- top-level nodes that appear later will
  // not get events delivered to them or their children, because event
  // handlers will not get installed on them..
  test.expect_fail();
  test_event("a23", 'inner21', 'click', {data: 23});

  set_weather("there", "peachy");
  Meteor.flush();
  // XXX expected failure -- if a LiveRange at toplevel gets
  // repopulated, then it won't get event handlers installed on
  // it. really the same case as the previous.
  test.expect_fail();
  test_event('a0', 'inner1', 'click', {data: 0});
  // main_event_tests();

  document.body.removeChild(onscreen);
});

notest("renderList - basics", function () {
  var c = new LocalCollection();

  var r = Meteor.ui.renderList(c.find({}, {sort: ['id']}), {
    render: function (doc) {
      return DIV({id: doc.id});
    },
    render_empty: function () {
      return DIV({id: "empty"});
    }
  });

  assert_frag("<empty></empty>", r);

  // Insertion

  c.insert({id: "D"});
  assert_frag("<D></D>", r);
  c.insert({id: "E"});
  assert_frag("<D></D><E></E>", r);
  c.insert({id: "F"});
  assert_frag("<D></D><E></E><F></F>", r);
  c.insert({id: "C"});
  assert_frag("<C></C><D></D><E></E><F></F>", r);
  c.insert({id: "D2"});
  assert_frag("<C></C><D></D><D2></D2><E></E><F></F>", r);

  // this should hit all of the edge cases in insert_before
  var parts;
  var do_insert = function (id) {
    c.insert({id: id});
    parts.push("<" + id + "></" + id + ">");
    parts.sort();
    assert_frag(parts.join(''), r);
  };
  try_all_permutations(
    function () {
      c.remove();
      parts = [];
      assert_frag("<empty></empty>", r);
    },
    [
      _.bind(do_insert, null, "D"),
      _.bind(do_insert, null, "E"),
      _.bind(do_insert, null, "F"),
      _.bind(do_insert, null, "G")
    ],
    function () {
      assert_frag("<D></D><E></E><F></F><G></G>", r);
    }
  );

  c.insert({id: "C"});
  c.insert({id: "D2"});
  c.remove({id: "G"});

  // Change without move

  c.update({id: "E"}, {$set: {id: "E2"}});
  assert_frag("<C></C><D></D><D2></D2><E2></E2><F></F>", r);
  c.update({id: "F"}, {$set: {id: "F2"}});
  assert_frag("<C></C><D></D><D2></D2><E2></E2><F2></F2>", r);
  c.update({id: "C"}, {$set: {id: "C2"}});
  assert_frag("<C2></C2><D></D><D2></D2><E2></E2><F2></F2>", r);
});

notest("renderList - removal", function () {
  var c = new LocalCollection();
  // (test is written in this weird way for historical reasons; feel
  // free to refactor)
  c.insert({id: "D"});
  c.insert({id: "E"});
  c.insert({id: "F"});
  c.insert({id: "G"});
  c.insert({id: "C"});
  c.insert({id: "D2"});
  c.remove({id: "G"});
  c.update({id: "E"}, {$set: {id: "E2"}});
  c.update({id: "F"}, {$set: {id: "F2"}});
  c.update({id: "C"}, {$set: {id: "C2"}});

  var r = Meteor.ui.renderList(c.find({}, {sort: ['id']}), {
    render: function (doc) {
      return DIV({id: doc.id});
    },
    render_empty: function () {
      return DIV({id: "empty"});
    }
  });

  c.remove({id: "D2"});
  assert_frag("<C2></C2><D></D><E2></E2><F2></F2>", r);
  c.remove({id: "F2"});
  assert_frag("<C2></C2><D></D><E2></E2>", r);
  c.remove({id: "C2"});
  assert_frag("<D></D><E2></E2>", r);
  c.remove({id: "E2"});
  assert_frag("<D></D>", r);
  c.remove({id: "D"});
  assert_frag("<empty></empty>", r);

  // this should hit all of the edge cases in extract
  var do_remove = function (id) {
    c.remove({id: id});
    delete parts["<" + id + "></" + id + ">"];
    assert_frag(_.keys(parts).sort().join('') || '<empty></empty>', r);
  };
  try_all_permutations(
    function () {
      parts = {};
      _.each(["D", "E", "F", "G"], function (id) {
        c.insert({id: id});
        parts["<" + id + "></" + id + ">"] = true;
      });
      assert_frag("<D></D><E></E><F></F><G></G>", r);
    },
    [
      _.bind(do_remove, null, "D"),
      _.bind(do_remove, null, "E"),
      _.bind(do_remove, null, "F"),
      _.bind(do_remove, null, "G")
    ],
    function () {
      assert_frag("<empty></empty>", r);
    }
  );
});

notest("renderList - default render empty", function () {
  var c = new LocalCollection();

  var r = Meteor.ui.renderList(c.find({}, {sort: ['id']}), {
    render: function (doc) {
      return DIV({id: doc.id});
    }
  });
  assert_frag("<!---->", r);

  c.insert({id: "D"});
  assert_frag("<D></D>", r);
  c.remove({id: "D"});
  assert_frag("<!---->", r);
});

notest("renderList - change and move", function () {
  var c = new LocalCollection();

  var r = Meteor.ui.renderList(c.find({}, {sort: ['id']}), {
    render: function (doc) {
      return DIV({id: doc.id});
    }
  });

  c.insert({id: "D"});
  c.insert({id: "E"});
  assert_frag("<D></D><E></E>", r);
  c.update({id: "D"}, {id: "F"});
  assert_frag("<E></E><F></F>", r);
  c.update({id: "E"}, {id: "G"});
  assert_frag("<F></F><G></G>", r);
  c.update({id: "G"}, {id: "C"});
  assert_frag("<C></C><F></F>", r);
  c.insert({id: "E"});
  assert_frag("<C></C><E></E><F></F>", r);
  c.insert({id: "D"});
  assert_frag("<C></C><D></D><E></E><F></F>", r);
  c.update({id: "C"}, {id: "D2"});
  assert_frag("<D></D><D2></D2><E></E><F></F>", r);
  c.update({id: "F"}, {id: "D3"});
  assert_frag("<D></D><D2></D2><D3></D3><E></E>", r);
  c.update({id: "D3"}, {id: "C"});
  assert_frag("<C></C><D></D><D2></D2><E></E>", r);
  c.update({id: "D2"}, {id: "F"});
  assert_frag("<C></C><D></D><E></E><F></F>", r);
});

notest("renderList - termination", function () {
  var c = new LocalCollection();

  var r = Meteor.ui.renderList(c.find({}, {sort: ['id']}), {
    render: function (doc) {
      return DIV({id: doc.id});
    }
  });

  c.remove();
  c.insert({id: "A"});
  assert_frag("<A></A>", r);
  Meteor.flush(); // not onscreen, so terminates
  c.insert({id: "B"});
  assert_frag("<A></A>", r);
  c.remove({id: "A"});
  assert_frag("<A></A>", r);
  Meteor.flush();
  assert_frag("<A></A>", r);

  var before_flush;
  var should_gc;
  var onscreen;
  var second_is_noop;
  try_all_permutations(
    // Set up
    function () {
      c.remove();
      c.insert({id: "A"});
      c.insert({id: "B"});
      r = Meteor.ui.renderList(c.find({}, {sort: ['id']}), {
        render: function (doc) {
          return DIV({id: doc.id});
        }
      });
      assert_frag("<A></A><B></B>", r);
      should_gc = false;
      onscreen = null;
      second_is_noop = false;
    },
    // Modify. Should not trigger GC, even though the element isn't
    // onscreen, since a flush hasn't happened yet.
    [1,
     function () {c.insert({id: "C"});},
     function () {c.update({id: "A"}, {id: "A2"});},
     function () {c.update({id: "A"}, {id: "X"});},
     function () {c.remove({id: "A"});}
    ],
    function () {
      before_flush = dump_frag(r);
      assert.notEqual("<A></A><B></B>", before_flush);
    },
    // Possibly put onscreen.
    [1,
     function () {
       onscreen = DIV({style: "display: none;"});
       onscreen.appendChild(r);
       document.body.appendChild(onscreen);
     },
     function () { }
    ],
    // Possibly flush.
    [1,
     function () {
       Meteor.flush();
       should_gc = !onscreen;
     },
     function () { }
    ],
    // Take a second action.
    [1,
     function () {c.insert({id: "D"});},
     function () {c.update({id: "B"}, {id: "B2"});},
     function () {c.update({id: "B"}, {id: "Y"});},
     function () {c.remove({id: "B"});},
     function () {second_is_noop = true;}
    ],
    // If GC was supposed to be triggered, make sure it actually was
    // triggered.
    function () {
      if (should_gc || second_is_noop)
        assert_frag(before_flush, onscreen || r);
      else
        assert.notEqual(before_flush, dump_frag(onscreen || r));

      if (onscreen)
        document.body.removeChild(onscreen);
    }
  );
});

notest("renderList - list items are reactive", function () {
  var c = new LocalCollection();

  set_weather("here", "cloudy");
  set_weather("there", "cloudy");
  Meteor.flush();
  var render_count = 0;
  var r = Meteor.ui.renderList(c.find({}, {sort: ['id']}), {
    render: function (doc) {
      render_count++;
      if (doc.want_weather)
        return DIV({id: doc.id + "_" + get_weather(doc.want_weather)});
      else
        return DIV({id: doc.id});
    }
  });
  var onscreen = DIV({style: "display: none;"});
  onscreen.appendChild(r);
  document.body.appendChild(onscreen);

  assert.equal(render_count, 0);
  c.insert({id: "A", want_weather: "here"});
  assert.equal(render_count, 1);
  assert_frag("<A_cloudy></A_cloudy>", onscreen);

  c.insert({id: "B", want_weather: "here"});
  assert.equal(render_count, 2);
  assert.length(_.keys(weather_listeners.here), 2);
  assert_frag("<A_cloudy></A_cloudy><B_cloudy></B_cloudy>", onscreen);

  c.insert({id: "C"});
  assert.equal(render_count, 3);
  assert.length(_.keys(weather_listeners.here), 2);
  assert_frag("<A_cloudy></A_cloudy><B_cloudy></B_cloudy><C></C>", onscreen);

  c.update({id: "B"}, {$set: {id: "B2"}});
  assert.equal(render_count, 4);
  assert.length(_.keys(weather_listeners.here), 3);
  assert_frag("<A_cloudy></A_cloudy><B2_cloudy></B2_cloudy><C></C>", onscreen);

  Meteor.flush();
  assert.equal(render_count, 4);
  assert.length(_.keys(weather_listeners.here), 2);
  assert_frag("<A_cloudy></A_cloudy><B2_cloudy></B2_cloudy><C></C>", onscreen);

  c.update({id: "B2"}, {$set: {id: "D"}});
  assert.equal(render_count, 5); // move doesn't rerender
  assert.length(_.keys(weather_listeners.here), 3);
  assert_frag("<A_cloudy></A_cloudy><C></C><D_cloudy></D_cloudy>", onscreen);

  Meteor.flush();
  assert.equal(render_count, 5);
  assert.length(_.keys(weather_listeners.here), 2);
  assert_frag("<A_cloudy></A_cloudy><C></C><D_cloudy></D_cloudy>", onscreen);

  set_weather("here", "sunny");
  assert.equal(render_count, 5);
  assert.length(_.keys(weather_listeners.here), 2);
  assert_frag("<A_cloudy></A_cloudy><C></C><D_cloudy></D_cloudy>", onscreen);

  Meteor.flush();
  assert.equal(render_count, 7);
  assert.length(_.keys(weather_listeners.here), 2);
  assert_frag("<A_sunny></A_sunny><C></C><D_sunny></D_sunny>", onscreen);

  c.remove({id: "A"});
  assert.equal(render_count, 7);
  assert.length(_.keys(weather_listeners.here), 2);
  assert_frag("<C></C><D_sunny></D_sunny>", onscreen);

  Meteor.flush();
  assert.equal(render_count, 7);
  assert.length(_.keys(weather_listeners.here), 1);
  assert.length(_.keys(weather_listeners.there), 0);
  assert_frag("<C></C><D_sunny></D_sunny>", onscreen);

  c.insert({id: "F", want_weather: "there"});
  assert.equal(render_count, 8);
  assert.length(_.keys(weather_listeners.here), 1);
  assert.length(_.keys(weather_listeners.there), 1);
  assert_frag("<C></C><D_sunny></D_sunny><F_cloudy></F_cloudy>", onscreen);

  r.appendChild(onscreen); // take offscreen
  Meteor.flush();
  assert.equal(render_count, 8);
  assert.length(_.keys(weather_listeners.here), 1);
  assert.length(_.keys(weather_listeners.there), 1);
  assert_frag("<C></C><D_sunny></D_sunny><F_cloudy></F_cloudy>", onscreen);

  // it's offscreen, but it wasn't taken off through a mechanism that
  // calls Meteor.ui._cleanup, so we take the slow GC path. the entries
  // will notice as they get invalidated, but the list won't notice
  // until it has a structure change (at which point any remaining
  // entries will get torn down too.)
  set_weather("here", "ducky");
  Meteor.flush();
  assert.equal(render_count, 8);
  assert.length(_.keys(weather_listeners.here), 0);
  assert.length(_.keys(weather_listeners.there), 1);
  assert_frag("<C></C><D_sunny></D_sunny><F_cloudy></F_cloudy>", onscreen);

  c.insert({id: "E"});
  // insert renders the doc -- it has to, since renderList GC happens
  // only on flush
  assert.equal(render_count, 9);
  assert.length(_.keys(weather_listeners.here), 0);
  assert.length(_.keys(weather_listeners.there), 1);
  assert_frag("<C></C><D_sunny></D_sunny><E></E><F_cloudy></F_cloudy>", onscreen);

  Meteor.flush();
  assert.equal(render_count, 9);
  assert.length(_.keys(weather_listeners.here), 0);
  assert.length(_.keys(weather_listeners.there), 0);
  assert_frag("<C></C><D_sunny></D_sunny><E></E><F_cloudy></F_cloudy>", onscreen);

  c.insert({id: "G"});
  Meteor.flush();
  assert.equal(render_count, 9);
  assert.length(_.keys(weather_listeners.here), 0);
  assert.length(_.keys(weather_listeners.there), 0);
  assert_frag("<C></C><D_sunny></D_sunny><E></E><F_cloudy></F_cloudy>", onscreen);
});

notest("renderList - multiple elements in an item", function () {
  var c = new LocalCollection();
  var r;

  var lengths = [];
  var present, changed, moved;
  var mode;
  var update = function (index) {
    if (mode === "add") {
      c.insert({index: index, moved: 0});
      present[index] = true;
    }
    else if (mode === "remove") {
      c.remove({index: index});
      present[index] = false;
    }
    else if (mode === "change") {
      c.update({index: index}, {$set: {changed: true}});
      changed[index] = true;
    }
    else if (mode === "move") {
      c.update({index: index}, {$set: {moved: 1}});
      moved[index] = true;
    }

    var parts = {}
    for (var i = 0; i < 3; i++) {
      if (present[i])
        parts[(moved[i] ? "1_" : "0_") + i] = i;
    }
    var expected = "";
    _.each(_.keys(parts).sort(), function (key) {
      var index = parts[key];
      for (var i = 0; i < lengths[index]; i++) {
        var id = index + "_" + i + (changed[index] ? "B" : "");
        expected += "<" + id + "></" + id + ">";
      }
      if (lengths[index] === 0)
        expected += "<!---->";
    });
    assert_frag(expected || "<!---->", r);
  };
  /* Consider uncommenting the 6 lines below in a "slow tests" mode */
  try_all_permutations(
    [1,
//     function () {lengths[0] = 0;},
     function () {lengths[0] = 1;},
//     function () {lengths[0] = 2;},
     function () {lengths[0] = 3;}
    ],
    [1,
//     function () {lengths[1] = 0;},
//     function () {lengths[1] = 1;},
     function () {lengths[1] = 2;},
     function () {lengths[1] = 3;}
    ],
    [1,
//     function () {lengths[2] = 0;},
     function () {lengths[2] = 1;},
     function () {lengths[2] = 2;}
//     ,function () {lengths[2] = 3;}
    ],
    [1,
     function () {mode = "add";},
     function () {mode = "remove";},
     function () {mode = "change";},
     function () {mode = "move";}
    ],
    function () {
      c.remove();
      Meteor.flush();
      r = Meteor.ui.renderList(c.find({}, {sort: ['moved', 'index']}), {
        render: function (doc) {
          var ret = [];
          for (var i = 0; i < lengths[doc.index]; i++)
            ret.push(DIV({id: doc.index + "_" + i + (doc.changed ? "B" : "")}));
          return ret;
        }
      });

      present = mode === "add" ? [false, false, false] : [true, true, true];
      changed = [false, false, false];
      moved = [false, false, false];
      if (mode !== "add") {
        for (var i = 0; i < 3; i++)
          c.insert({index: i, moved: 0});
      }
    },
    [
      _.bind(update, null, 0),
      _.bind(update, null, 1),
      _.bind(update, null, 2)
    ]
  );
});

notest("renderList - #each", function () {
  var c = new LocalCollection();

  var render_count = 0;

  _.extend(Template.test_renderList_each, {
    render_count: function () {
      return render_count++;
    },
    weather: function (where) {
      return get_weather(where);
    },
    data: function () {
      return c.find({x: {$lt: 5}}, {sort: ["x"]});
    },
    data2: function () {
      return c.find({x: {$gt: 5}}, {sort: ["x"]});
    }
  });

  set_weather("here", "ducky");


  onscreen = DIV({style: "display: none;"});
  onscreen.appendChild(Template.test_renderList_each());
  document.body.appendChild(onscreen);

  assert_frag("~Before0<!---->Middle~Else~After~", onscreen);
  assert.length(_.keys(weather_listeners.here), 0);

  c.insert({x: 2, name: "A"});
  assert_frag("~Before0~Aducky~Middle~Else~After~", onscreen);
  assert.length(_.keys(weather_listeners.here), 1);

  c.insert({x: 3, name: "B"});
  assert_frag("~Before0~Aducky~~Bducky~Middle~Else~After~", onscreen);
  assert.length(_.keys(weather_listeners.here), 2);

  set_weather("here", "clear");
  assert_frag("~Before0~Aducky~~Bducky~Middle~Else~After~", onscreen);
  assert.length(_.keys(weather_listeners.here), 2);
  Meteor.flush();
  assert_frag("~Before0~Aclear~~Bclear~Middle~Else~After~", onscreen);
  assert.length(_.keys(weather_listeners.here), 2);

  c.update({x: 3}, {$set: {x: 8}}, {multi: true});
  assert_frag("~Before0~Aclear~Middle~B~After~", onscreen);
  assert.length(_.keys(weather_listeners.here), 2);
  Meteor.flush();
  assert.length(_.keys(weather_listeners.here), 1);

  return;

  c.update({}, {$set: {x: 5}}, {multi: true});
  assert_frag("~Before0<!---->Middle~Else~After~", onscreen);
  assert.length(_.keys(weather_listeners.here), 1);
  Meteor.flush();
  assert.length(_.keys(weather_listeners.here), 0);

  document.body.removeChild(onscreen);

});

/* Still to test:
  - render_empty gets events attached
  - moved preserves events
  - renderlists inside other renderlists work and GC correctly
  - passing in an existing query [optional, it's undocumented..]
*/
