/*global test, asyncTest, ok, equal, deepEqual, start, module */
require([
    'vendor/jquery',
    'vendor/underscore',
    'vendor/t',
    'api/v1/recordseries',
    'vendor/gloss/data/tree',
    'vendor/gloss/data/mock',
    'vendor/gloss/data/model',
    'text!util/test/hierarchy_test_fixtures.json',
    'text!api/v1/test/fixtures/recordseries_tree.json'
], function($, _, t, RecordSeries, Tree, Mock, model, fixturesJSON,
    recordseries_tree) {

    var recordseries = _.map(JSON.parse(recordseries_tree), function(item) {
            return item[1];
        }),
        setup = function() {
            this.manager = model.Manager(RecordSeries);
            this.tree = Tree({
                resource: RecordSeries,
                query: { file_plan_id: 1 },
                manager: this.manager
            });
        },
        levelCheck = function(tree) {
            var level = function(node) {
                var level = 0, cur = node.par;
                while (cur !== tree.root) {
                    cur = cur.par;
                    level++;
                }
                return level;
            };
            t.dfs(tree.root.children, function() {
                equal(this.level, level(this));
            });
        },
        expandSeveralNodes = function(tree) {
            var dfd = $.Deferred();
            tree.load().done(function(root) {
                $.when(
                    root.children[0].load(),
                    root.children[3].load(),
                    _.last(root.children).load()
                ).done(function() {
                    $.when(
                        find(tree, 'second from under alpha').load(),
                        find(tree, 'blah blah').load(),
                        find(tree, 2).load(),
                        find(tree, 177).load(),
                        find(tree, '.git').load()
                    ).done(function() {
                        $.when(
                            find(tree, 'alpha boo').load(),
                            find(tree, 'alpha too').load()
                        ).done(function() {
                            dfd.resolve();
                        });
                    });
                });
            });
            return dfd;
        },
        expandSeveralNodesAndSeveralMore = function(tree) {
            var dfd = $.Deferred();
            expandSeveralNodes(tree).done(function() {
                $.when(
                    find(tree, 10).load(),
                    find(tree, 178).load(),
                    find(tree, 10137).load(),
                    find(tree, 10135).load()
                ).done(function() {
                    $.when(
                        find(tree, 11).load(),
                        find(tree, 179).load(),
                        find(tree, 10138).load(),
                        find(tree, 10164).load()
                    ).done(function() {
                        $.when(
                            find(tree, 180).load(),
                            find(tree, 10139).load()
                        ).done(function() {
                            dfd.resolve();
                        });
                    });
                });
            });
            return dfd;
        },
        structure = function(tree) {
            var out = [], indent = 0, removeLevels = false;
            if (!tree) {
                return '';
            }
            if (!tree.root) {
                removeLevels = true;
                tree.level = -1;
                t.dfs(tree, function(node, par) {
                    node.level = par? par.level + 1 : 0;
                });
            }
            t.dfs(tree.root? tree.root.children : tree, function() {
                var nonStandardKeys;
                out.push(
                    Array(this.level+1).join('    '),
                    this.model ? this.model.id : this.id,
                    ': ',
                    this.model ? this.model.name : this.name
                );
                if (this.model) {
                    if (this.model.isparent) {
                        out.push('+');
                    }
                } else {
                    nonStandardKeys = _.filter(_.keys(this), function(key) {
                        return _.indexOf(['id', 'name', 'children', 'level'], key) < 0;
                    });
                    if (nonStandardKeys.length) {
                        out.push(' *');
                    }
                }
                out.push('\n');
            });
            if (removeLevels) {
                t.dfs(tree, function() { delete this.level; });
            }
            return out.join('');
        },
        find = function(tree, id) {
            return t.find(tree.root, function() {
                return this.model[_.isString(id)? 'name' : 'id'] === id;
            });
        };

    Mock(RecordSeries, recordseries_tree);

    module('tree', {setup: setup});

    asyncTest('load full tree recursively', function() {
        var tree = Tree({
            resource: RecordSeries,
            query: {
                file_plan_id: 1,
                recursive: true
            }
        });
        tree.on('change', function() {
            ok(false, 'loading nodes should trigger "update" events, but "change" event was triggered');
        });
        tree.load().done(function(root) {
            var result = [];
            ok(root === tree.root);
            t.dfs(root.children, function() { result.push(this.model); });
            _.each(recordseries, function(rs, i) {
                equal(rs.id, result[i].id);
            });
            equal(result.length, recordseries.length);
            levelCheck(tree);
            start();
        });
    });

    asyncTest('load tree incrementally', function() {
        var tree = this.tree, updateCount = 0;
        tree.on('change', function() {
            ok(false, 'loading nodes should trigger "update" events, but "change" event was triggered');
        }).on('update', function() {
            updateCount++;
        });
        tree.load().done(function(root) {
            var count = 0;
            t.dfs(root.children, function() { count += 1; });
            equal(count, 6);
            equal(root.children.length, _.reduce(recordseries, function(count, rs) {
                return count + (rs.parent_id == root.model.id? 1 : 0);
            }, 0));
            _.each(root.children, function(node) {
                ok(node.children == null);
            });

            root.children[0].load().done(function(firstChild) {
                var count = 0;
                t.dfs(firstChild.children, function() { count += 1; });
                equal(count, 5);
                equal(firstChild.children.length, _.reduce(recordseries, function(count, rs) {
                    return count + (rs.parent_id == firstChild.model.id? 1 : 0);
                }, 0));
                _.each(firstChild.children, function(node) {
                    ok(node.children == null);
                });

                firstChild.load().done(function(firstChild) {
                    levelCheck(tree);

                    // since .load() was called twice on firstChild, the
                    // 'update' callback only fired twice
                    equal(updateCount, 2);
                    start();
                });
            });
        });
    });

    asyncTest('reloading nodes doesnt break anything', function() {
        var tree = this.tree;
        tree.load().done(function(root) {
            root.children[0].load().done(function(firstChild) {
                var loadWasCalledAgain = false;
                firstChild.collection.__load__ = firstChild.collection.load;
                firstChild.collection.load = function() {
                    loadWasCalledAgain = true;
                    firstChild.collection.__load__.apply(firstChild, arguments);
                };
                firstChild.load().done(function() {
                    var count = 0;
                    equal(loadWasCalledAgain, false);
                    t.dfs(firstChild.children, function() { count++; });
                    equal(count, 5);
                    firstChild.set('query', {recursive: true});
                    firstChild.load().done(function() {
                        var count = 0;
                        equal(loadWasCalledAgain, false);
                        t.dfs(firstChild.children, function() { count++; });
                        equal(count, 53);
                        start();
                    });
                });
            });
        });
    });

    module('moving a node', {setup: setup});

    asyncTest('down', function() {
        var tree = this.tree,
            inital = '1: alpha something+\n    8: second from under alpha+\n        9: alpha boo+\n            10: first+\n            20: second+\n        506: child of second\n    512: blah blah\n    511: something else\n    2: first+\n        3: alpha too+\n            5: second\n            4: first\n        6: beta+\n    23: third+\n52: beta fooasdfasdf+\n169: gamma+\n176: delta+\n    177: first+\n        178: alpha+\n        202: beta+\n        205: gamma+\n207: epsilon+\n8932: netware output+\n    10131: .git+\n        10137: logs+\n        10135: refs+\n        10136: objects+\n        10134: hooks\n        10133: info\n    10132: test_create_folder\n    10130: siq_licenses\n',
            after = '1: alpha something+\n    512: blah blah\n    8: second from under alpha+\n        9: alpha boo+\n            10: first+\n            20: second+\n        506: child of second\n    511: something else\n    2: first+\n        3: alpha too+\n            5: second\n            4: first\n        6: beta+\n    23: third+\n52: beta fooasdfasdf+\n169: gamma+\n176: delta+\n    177: first+\n        178: alpha+\n        202: beta+\n        205: gamma+\n207: epsilon+\n8932: netware output+\n    10131: .git+\n        10137: logs+\n        10135: refs+\n        10136: objects+\n        10134: hooks\n        10133: info\n    10132: test_create_folder\n    10130: siq_licenses\n';
        expandSeveralNodes(tree).done(function() {
            var node = find(tree, 8);
            equal(structure(tree), inital);
            node.moveTo(node.par, node.index() + 1).done(function() {
                equal(structure(tree), after);
                start();
            });
        });
    });

    asyncTest('up', function() {
        var tree = this.tree,
            inital = '1: alpha something+\n    8: second from under alpha+\n        9: alpha boo+\n            10: first+\n            20: second+\n        506: child of second\n    512: blah blah\n    511: something else\n    2: first+\n        3: alpha too+\n            5: second\n            4: first\n        6: beta+\n    23: third+\n52: beta fooasdfasdf+\n169: gamma+\n176: delta+\n    177: first+\n        178: alpha+\n        202: beta+\n        205: gamma+\n207: epsilon+\n8932: netware output+\n    10131: .git+\n        10137: logs+\n        10135: refs+\n        10136: objects+\n        10134: hooks\n        10133: info\n    10132: test_create_folder\n    10130: siq_licenses\n',
            after = '1: alpha something+\n    8: second from under alpha+\n        9: alpha boo+\n            10: first+\n            20: second+\n        506: child of second\n    512: blah blah\n    2: first+\n        3: alpha too+\n            5: second\n            4: first\n        6: beta+\n    511: something else\n    23: third+\n52: beta fooasdfasdf+\n169: gamma+\n176: delta+\n    177: first+\n        178: alpha+\n        202: beta+\n        205: gamma+\n207: epsilon+\n8932: netware output+\n    10131: .git+\n        10137: logs+\n        10135: refs+\n        10136: objects+\n        10134: hooks\n        10133: info\n    10132: test_create_folder\n    10130: siq_licenses\n';
        expandSeveralNodes(tree).done(function() {
            var node = find(tree, 2);
            equal(structure(tree), inital);
            node.moveTo(node.par, node.index() - 1).done(function() {
                equal(structure(tree), after);
                start();
            });
        });
    });

    asyncTest('left', function() {
        var tree = this.tree,
            inital = '1: alpha something+\n    8: second from under alpha+\n        9: alpha boo+\n            10: first+\n            20: second+\n        506: child of second\n    512: blah blah\n    511: something else\n    2: first+\n        3: alpha too+\n            5: second\n            4: first\n        6: beta+\n    23: third+\n52: beta fooasdfasdf+\n169: gamma+\n176: delta+\n    177: first+\n        178: alpha+\n        202: beta+\n        205: gamma+\n207: epsilon+\n8932: netware output+\n    10131: .git+\n        10137: logs+\n        10135: refs+\n        10136: objects+\n        10134: hooks\n        10133: info\n    10132: test_create_folder\n    10130: siq_licenses\n',
            after = '1: alpha something+\n    8: second from under alpha+\n        506: child of second\n    512: blah blah\n    511: something else\n    2: first+\n        3: alpha too+\n            5: second\n            4: first\n        6: beta+\n    23: third+\n52: beta fooasdfasdf+\n    53: first+\n    65: second+\n    82: third+\n    9: alpha boo+\n        10: first+\n        20: second+\n169: gamma+\n176: delta+\n    177: first+\n        178: alpha+\n        202: beta+\n        205: gamma+\n207: epsilon+\n8932: netware output+\n    10131: .git+\n        10137: logs+\n        10135: refs+\n        10136: objects+\n        10134: hooks\n        10133: info\n    10132: test_create_folder\n    10130: siq_licenses\n';
        expandSeveralNodes(tree).done(function() {
            var node = find(tree, 9),
                newParent = find(tree, 52);
            equal(structure(tree), inital);
            node.moveTo(newParent).done(function() {
                equal(structure(tree), after);
                start();
            });
        });
    });

    asyncTest('right', function() {
        var tree = this.tree,
            inital = '1: alpha something+\n    8: second from under alpha+\n        9: alpha boo+\n            10: first+\n            20: second+\n        506: child of second\n    512: blah blah\n    511: something else\n    2: first+\n        3: alpha too+\n            5: second\n            4: first\n        6: beta+\n    23: third+\n52: beta fooasdfasdf+\n169: gamma+\n176: delta+\n    177: first+\n        178: alpha+\n        202: beta+\n        205: gamma+\n207: epsilon+\n8932: netware output+\n    10131: .git+\n        10137: logs+\n        10135: refs+\n        10136: objects+\n        10134: hooks\n        10133: info\n    10132: test_create_folder\n    10130: siq_licenses\n',
            after = '1: alpha something+\n    8: second from under alpha+\n        9: alpha boo+\n            10: first+\n            20: second+\n        506: child of second\n    512: blah blah\n    511: something else\n    2: first+\n        3: alpha too+\n            5: second\n            4: first+\n                176: delta+\n                    177: first+\n                        178: alpha+\n                        202: beta+\n                        205: gamma+\n        6: beta+\n    23: third+\n52: beta fooasdfasdf+\n169: gamma+\n207: epsilon+\n8932: netware output+\n    10131: .git+\n        10137: logs+\n        10135: refs+\n        10136: objects+\n        10134: hooks\n        10133: info\n    10132: test_create_folder\n    10130: siq_licenses\n';
        expandSeveralNodes(tree).done(function() {
            var node = find(tree, 176),
                newParent = find(tree, 4);
            equal(structure(tree), inital);
            node.moveTo(newParent, 0).done(function() {
                equal(structure(tree), after);
                start();
            });
        });
    });

    asyncTest('moving a node triggers the "change" event at tree', function() {
        var tree = this.tree;
        expandSeveralNodes(tree).done(function() {
            var changeArgs,
                node = find(tree, 176),
                newParent = find(tree, 4),
                updateCount = 0,
                changeCount = 0;
            tree.on('update', function() {
                updateCount++;
            }).on('change', function() {
                changeArgs = Array.prototype.slice.call(arguments, 0);
                changeCount++;
            });
            node.moveTo(newParent, 0).done(function() {
                equal(changeCount, 1);
                equal(updateCount, 1); // one 'update' from expanding the node
                equal(changeArgs.length, 4);
                equal(changeArgs[0], 'change');
                ok(changeArgs[1] === node);
                equal(changeArgs[2], 'move');
                ok(changeArgs[3] === newParent);
                start();
            });
        });
    });

    asyncTest('moving the last child from parent makes parent a leaf node', function() {
        var tree = this.tree;
        expandSeveralNodes(tree).done(function() {
            var node1 = find(tree, 9),
                node2 = find(tree, 506),
                newParent = find(tree, 169),
                origParent = node1.par;
            $.when(
                node1.moveTo(newParent),
                node2.moveTo(newParent)
            ).done(function() {
                equal(origParent.model.isparent, false);
                equal(origParent.children, undefined);
                equal(origParent._loaded, true);
                equal(origParent._loadedRecursive, true);
                start();
            });
        });
    });

    asyncTest('promote into leaf node turns leaf to parent', function() {
        var tree = this.tree;
        expandSeveralNodes(tree).done(function() {
            var node = find(tree, 8932),
                newParent = find(tree, 4);
            node.moveTo(newParent).done(function() {
                equal(newParent.model.isparent, true);
                equal(newParent.children.length, 1);
                start();
            });
        });
    });

    module('add/remove', {setup: setup});

    asyncTest('removeChild works', function() {
        var tree = this.tree;
        expandSeveralNodes(tree).done(function() {
            var removedIds = [],
                node = find(tree, 9),
                origParent = node.par,
                origChildrenLength = origParent.children.length;
            t.dfs(node, function() { removedIds.push(this.model.id); });
            node.remove();
            equal(origParent.children.length, origChildrenLength-1);
            ok(origParent._removedChildren);
            ok(origParent._removedChildren[0] === node);
            equal(origParent._removedChildren.length, 1);
            t.dfs(tree.root, function() {
                equal(_.indexOf(removedIds, this.model.id), -1);
            });
            start();
        });
    });

    asyncTest('remove last child changes isparent to false', function() {
        var tree = this.tree;
        expandSeveralNodes(tree).done(function() {
            var node = find(tree, 177),
                origParent = node.par;
            origParent.removeChild(node);
            equal(origParent.model.isparent, false);
            ok(origParent._removedChildren);
            ok(origParent._removedChildren[0] === node);
            equal(origParent._removedChildren.length, 1);
            start();
        });
    });

    asyncTest('remove child triggers "change" event at tree', function() {
        var tree = this.tree, changeArgs, count = 0, updateCount = 0;
        tree.on('change', function() {
            changeArgs = Array.prototype.slice.call(arguments, 0);
            count++;
        });
        expandSeveralNodes(tree).done(function() {
            var node = find(tree, 177),
                origParent = node.par;
            tree.on('update', function() { updateCount++; });
            origParent.removeChild(node);
            equal(count, 1);
            equal(updateCount, 0);
            equal(changeArgs.length, 4);
            equal(changeArgs[0], 'change');
            ok(changeArgs[1] === origParent);
            equal(changeArgs[2], 'remove');
            ok(changeArgs[3] === node);
            start();
        });
    });

    asyncTest('add node to tree', function() {
        var tree = this.tree;
        expandSeveralNodes(tree).done(function() {
            var newNode, newName =  'something very unique',
                model = RecordSeries({name: newName}),
                newParent = find(tree, 8);
            newParent.add(model).done(function() {
                newNode = _.find(newParent.children, function(c) {
                    return c.model === model;
                });
                ok(newNode);
                ok(newNode === _.last(newParent.children));
                equal(newNode.model.parent_id, newParent.model.id);
                equal(newNode.model.name, newName);
                start();
            });
        });
    });

    asyncTest('node changes from leaf to parent when child added', function() {
        var tree = this.tree;
        expandSeveralNodes(tree).done(function() {
            var newNode, newName =  'something very unique',
                model = RecordSeries({name: newName}),
                newParent = find(tree, 4);
            equal(newParent.model.isparent, false);
            newParent.add(model).done(function() {
                equal(newParent.model.isparent, true);
                start();
            });
        });
    });

    asyncTest('adding a node triggers "change" event in parent', function() {
        var tree = this.tree;
        expandSeveralNodes(tree).done(function() {
            var newNode, changeArgs, newName =  'something very unique',
                model = RecordSeries({name: newName}),
                newParent = find(tree, 4),
                updateCount = 0,
                changeCount = 0;
            tree.on('update', function() {
                updateCount++;
            }).on('change', function() {
                changeArgs = Array.prototype.slice.call(arguments, 0);
                changeCount++;
            });
            newParent.add(model).done(function() {
                equal(changeCount, 1);
                equal(updateCount, 1); // one 'update' from expanding the node
                equal(changeArgs.length, 4);
                equal(changeArgs[0], 'change');
                ok(changeArgs[1] === newParent);
                equal(changeArgs[2], 'add');
                ok(changeArgs[3].model === model);
                start();
            });
        });
    });

    module('test deltas', {
        setup: function() { }
    });

    asyncTest('tree of deltas works', function() {
        setup.call(this);
        var tree = this.tree;
        expandSeveralNodesAndSeveralMore(tree).done(function() {
            var deltas;
            console.log(structure(tree.deltas()));
            console.log('%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%');
            console.log(structure(tree));
            console.log('%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%');
            find(tree, 10167).model.set('name', 'origin renamed');
            deltas = tree.deltas();
            console.log(structure(deltas));
            start();
        });
    });

});
