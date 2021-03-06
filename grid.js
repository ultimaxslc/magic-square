Squares = new Meteor.Collection('square');
Stencils = new Meteor.Collection('stencil');

_.templateSettings = {
    interpolate: /(link\[[0-9]+\])/g
};

if (Meteor.isClient) {
    
    // Meteor.subscribe('All');

    Template.canvas.squares = function() {
        return Squares.find({}, {
            sort: {
                y: 1,
                x: 2
            }
        });
    };

    Template.canvas.xpos = function() {
        return this.x * 100
    }

    Template.canvas.ypos = function() {
        return this.y * 100
    }

    Template.canvas.heightpx = function() {
        return this.height * 100;
    }

    Template.canvas.widthpx = function() {
        return this.width * 100;
    }

    Template.canvas.read = function() {
        var query, value = this.value;

        //Priority
        if (typeof value == 'string' && value.match(/link\[[0-9]+\]/)) {

            var linkArray = _.map(this.link, function(link) {
                return Squares.findOne(link).value;
            });

            value = _.template(value, linkArray, {
                variable: 'link'
            });

            //No return, so that the value is carried forward
        }

        if (typeof value == 'string' && value.match(/^https?:\/\/(?:[a-z\-]+\.)+[a-z]{2,6}(?:\/[^\/#?]+)+\.(?:jpe?g|gif|png)$/i)) {
            return new Handlebars.SafeString('<img src="' + value + '">');
        }

        if (typeof value == 'string' && value.match(/^(map|map of) /i)) {
            query = value.replace(/^(map|map of) /, '');

            return new Handlebars.SafeString('<img src="http://maps.googleapis.com/maps/api/staticmap?center=' + query + '&markers=color:green|' + query + '&zoom=14&size=' + this.width * 100 + 'x' + this.height * 100 + '&sensor=false">');
        }

        if (typeof value == 'string' && value.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/i)) {
            var match = value.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
            if (match && match[2].length == 11) {
                return new Handlebars.SafeString('<iframe width="' + this.width * 100 + '" height="' + this.height * 100 + '" src="//www.youtube.com/embed/' + match[2] + '" frameborder="0" allowfullscreen></iframe>');
            } else {
                return value;
            }
        }

        //# Detect Array and build List UI
        //Expected format ["London" ,"Tokyo" ,"Paris"]
        //Alternate format [{text:"Appple", href:"http://apple.com"} , {text:"Amazon",href:"http://amazon.com"}]

        if (Array.isArray(value)) {

            result = '<ul class="' + _.sample(['fly', 'cards', 'wave', 'curl', 'papercut']) + '">\n';

            _.each(value, function(row) {
                if (typeof row == 'object') {
                    if (typeof row.href == 'string' && typeof row.text == 'string') {
                        result += '<li><a href="' + row.href + '">' + row.text + '</a></li>\n'
                    }
                } else {
                    result += '<li>' + row + '</li>\n'
                }
            })

            result += '</ul>'

            _.defer(function() {
                stroll.bind('.square ul');
            });

            return new Handlebars.SafeString(result);

        }

        return new Handlebars.SafeString(value);
    }

    Template.toolbox.stencils = function() {
        return Stencils.find({});
    }

    Grid = {
        startSelect: null,
        endSelect: null,
        copy: null,
        cut: null
    }

    Action = {
        copy: function() {
            Grid.copy = _.pick(Grid.startSelect, 'fn', 'value', 'style', 'link', 'url');
        },
        paste: function() {
            Squares.update(Grid.startSelect._id, {
                $set: Grid.copy
            });
        },
        cut: function() {
            Action.copy();
            Action.delete();
        },
        delete: function() {

            if (Grid.startSelect.value != undefined) {

                Squares.update(Grid.startSelect._id, {
                    $unset: {
                        value: 1,
                        fn: 1,
                        style: 1,
                        url: 1
                    },
                    $set: {
                        link: [],
                    }
                });

            } else {

                Action.split();

            }
        },
        resetCanvas: function() {
            Meteor.call('reset');
        },

        addStencil: function() {
            bootbox.prompt({
                title: 'Title for Stencil',
                inputType: 'text',
                callback: function(title) {
                    if (title == null) return;
                    var stencil = _.pick(Grid.startSelect, 'fn', 'value', 'style', 'url');
                    stencil.title = title;

                    Stencils.insert(stencil);
                }
            });
        },
        copyStencil: function() {
            Grid.copy = _.pick(this, 'fn', 'value', 'style', 'url');
        },
        deleteStencil: function() {
            Stencils.remove(this._id);
        },
        refresh: function(target) {
            if (target.url) {
                Action.fetch(target.url);
            } else {
                try {
                    var fn = new Function(['$', 'link', 'ID'], target.fn);

                    var linkArray = _.map(target.link, function(link) {
                        return Squares.findOne(link);
                    });

                    Squares.update(target._id, {
                        $set: {
                            value: fn($, linkArray, target._id),
                        }
                    });
                } catch (error) {
                    bootbox.alert(error.message);
                }
            }
        },
        refreshAll: function() {
            //Placeholder
        },
        editLinks: function() {
            if (Grid.selectLink) {

                Grid.selectLink = false;
                $('.main-container .square').css('cursor', 'default');

                Squares.find({
                    linked: true
                }, {
                    transform: function(e) {
                        Squares.update(e._id, {
                            $set: {
                                linked: false
                            }
                        });
                    }
                }).fetch();

            } else {

                Grid.selectLink = true;
                $('.main-container .square').css('cursor', 'cell');

                Squares.find({
                    _id: {
                        $in: Grid.startSelect.link
                    }
                }, {
                    transform: function(e) {
                        Squares.update(e._id, {
                            $set: {
                                linked: true
                            }
                        });
                    }
                }).fetch();

            }
        },
        moveCursor: function(direction) {
            var newX = Grid.startSelect.x,
                newY = Grid.startSelect.y;

            if (!(direction == 'up' || direction == 'down' || direction == 'left' || direction == 'right')) {
                return;
            }

            switch (direction) {
                case 'up':
                    newY--;
                    break;
                case 'down':
                    newY++;
                    break;
                case 'left':
                    newX--;
                    break;

                case 'right':
                    newX++;
                    break;

            }

            var newSquare = Squares.findOne({
                x: newX,
                y: newY
            });

            if (newSquare) {
                Grid.startSelect = newSquare;

                Session.set('menu.x', Grid.startSelect.x + (Grid.startSelect.width - 1) / 2);
                Session.set('menu.y', Grid.startSelect.y + (Grid.startSelect.height - 1) / 2);
            }
        },
        edit: function() {
            bootbox.prompt({
                title: 'Cell Value',
                inputType: 'text',
                instruction: $('<b>You can try these examples:</b><br><ul><li>map of singapore management university</li><li>http://www.youtube.com/watch?v=tqgO-SwnIEY</li><li>http://mozorg.cdn.mozilla.net/media/img/firefox/new/header-firefox.png</li></ul>'),
                value: Grid.startSelect.value,
                callback: function(input) {
                    if (input == null) {
                        return;
                    }

                    try {
                        input = JSON.parse(input);
                        console.log(input)
                    } catch (e) {
                        console.warn("Cannot parse value as JSON: " + e.message);
                    }

                    //if there is a change
                    if (input != Grid.startSelect.value) {
                        Squares.update(Grid.startSelect._id, {
                            $set: {
                                value: input
                            }
                        });

                        //TODO Recursive propagation
                        //Propagate changes
                        Squares.find({
                            link: Grid.startSelect._id
                        }, {
                            transform: function(e) {
                                Action.refresh(e);
                            }
                        }).fetch();
                    }
                }
            });
        },
        editURL: function() {
            bootbox.prompt({
                title: 'What is the URL to call?',
                inputType: 'text',
                instruction: $('<div class="well">If this URL points to a standard HTML page, the result will be wrapped in a $ object. You can then use the standard jQuery style CSS selector and traversal to extract the information you are interested in. If the URL points to a RESTful webservice endpoint, the JSON response will be wrapped in an object named as "data". </div>'),
                value: Grid.startSelect.url,
                callback: function(input) {
                    if (input == null) {
                        return;
                    }

                    if (input.match(/^(http|https):\/\/[^"]+$/)) {
                        if (input != Grid.startSelect.url) {
                            Squares.update(Grid.startSelect._id, {
                                $set: {
                                    url: input
                                }
                            }, function () {
                                Grid.startSelect.url = input;
                                Action.refresh(Grid.startSelect);
                            });
                        }
                    } else {
                        bootbox.alert('Invalid URL');
                    }
                }
            });
        },
        editFunction: function() {
            bootbox.prompt({
                title: 'Attach a Javascript Function',
                inputType: 'function',
                mode: 'javascript',
                instruction: $('<b>Objects available: </b><br><ul><li>$: jQuery Object</li><li>link: javascript array of linked cells</li><li>data: JSON response from webservice</li></ul>'),
                value: Grid.startSelect.fn || "var a = $(window).height()\nreturn a;",
                callback: function(statements) {
                    if (statements == null) {
                        return;
                    }

                    try {
                        var fn = new Function(['$', 'link'], statements);

                        Squares.update(Grid.startSelect._id, {
                            $set: {
                                fn: statements
                            }
                        });

                        Action.refresh(Grid.startSelect);
                    } catch (error) {
                        bootbox.alert(error.message);
                    }
                }
            });
        },
        editStyle: function() {
            bootbox.prompt({
                title: 'Custom CSS Style',
                inputType: 'function',
                mode: 'css',
                value: Grid.startSelect.style || "font-size: 2em;\nline-height: 100px;\ntext-align: center;",
                callback: function(css) {
                    if (css == null) {
                        return;
                    }

                    // css = css.replace(/\n/g, '');

                    Squares.update(Grid.startSelect._id, {
                        $set: {
                            style: css,
                        }
                    });
                }
            });
        },
        split: function() {

            var height = Grid.startSelect.height
            var width = Grid.startSelect.width

            if (height > 1 || width > 1) {

                var x = Grid.startSelect.x
                var y = Grid.startSelect.y

                var id = Grid.startSelect._id;

                for (yoffset = 0; yoffset < height; yoffset++) {
                    for (xoffset = 0; xoffset < width; xoffset++) {

                        if (xoffset == 0 && yoffset == 0) {
                            Squares.update(id, {
                                $set: {
                                    height: 1,
                                    width: 1
                                }
                            });
                        } else {
                            Squares.insert({
                                x: x + xoffset,
                                y: y + yoffset,
                                height: 1,
                                width: 1,
                                link: [],
                                selected: false
                            });
                        }
                    }
                }
            }
        },
        merge: function() {
            var toMerge = Squares.find({
                selected: true
            }).fetch();

            var result = _.reduce(toMerge, function(memo, e) {
                //Memo [maxX, maxY, minX, minY]
                if (memo[0] == null || e.x > memo[0]) {
                    memo[0] = e.x;
                }
                if (memo[1] == null || e.y > memo[1]) {
                    memo[1] = e.y;
                }

                if (memo[2] == null || e.x < memo[2]) {
                    memo[2] = e.x;
                }
                if (memo[3] == null || e.y < memo[3]) {
                    memo[3] = e.y;
                }

                return memo;
            }, [null, null, null, null]);

            var width = result[0] - result[2] + 1;
            var height = result[1] - result[3] + 1;;

            _.each(toMerge, function(e) {
                if (e.x == result[2] && e.y == result[3]) {
                    Squares.update(e._id, {
                        $set: {
                            height: height,
                            width: width,
                            selected: false
                        }
                    });

                    Grid.startSelect = e;
                } else {
                    Squares.remove(e._id);
                }
            });

            // TODO            
            // //Remove self from other cells linking to it. 
            // Squares.find({
            //     link: id
            // }, {
            //     transform: function(e) {
            //         Squares.update(e._id)
            //     }
            // })

            // Squares.remove(id);

        },
        fetch: function(url) {
            Meteor.call('fetch', url, Grid.startSelect.fn, Grid.startSelect._id)
        }
    }

    Template.canvas.events({
        'mousedown .main-container': function(e) {
            Grid.drag = _.pick(e, 'x', 'y');
            Grid.drag.scrollTop = $('body').scrollTop();
            Grid.drag.scrollLeft = $('body').scrollLeft();

        },
        'mousemove .main-container': function(e) {
            var sensitivity = 10;

            if (Grid.drag != null) {
                if (Math.abs(e.x - Grid.drag.x) > sensitivity || Math.abs(e.y - Grid.drag.y) > sensitivity) {
                    $('body').css('cursor', 'move');
                    $('body').scrollTop(Grid.drag.scrollTop - e.y + Grid.drag.y);
                    $('body').scrollLeft(Grid.drag.scrollLeft - e.x + Grid.drag.x);
                }
            }
        },
        'mouseup .main-container': function(e) {
            Grid.drag = null;
            $('body').css('cursor', 'default');
        },
        'click .square': function(e) {

            if (e.shiftKey) {
                Grid.endSelect = this;

                var largerX, largerY, smallerX, smallerY;

                if (Grid.endSelect.x > Grid.startSelect.x) {
                    largerX = Grid.endSelect.x;
                    smallerX = Grid.startSelect.x;
                } else {
                    smallerX = Grid.endSelect.x;
                    largerX = Grid.startSelect.x;
                }

                if (Grid.endSelect.y > Grid.startSelect.y) {
                    largerY = Grid.endSelect.y;
                    smallerY = Grid.startSelect.y;
                } else {
                    smallerY = Grid.endSelect.y;
                    largerY = Grid.startSelect.y;
                }

                Squares.find({
                    selected: true
                }, {
                    transform: function(e) {
                        Squares.update(e._id, {
                            $set: {
                                selected: false
                            }
                        });
                    }
                }).fetch();

                Squares.find({
                    x: {
                        $gte: smallerX,
                        $lte: largerX,
                    },
                    y: {
                        $gte: smallerY,
                        $lte: largerY,
                    },
                    selected: false
                }, {
                    transform: function(e) {
                        Squares.update(e._id, {
                            $set: {
                                selected: true
                            }
                        });
                    }
                }).fetch();

                Session.set('menu.x', (Grid.startSelect.x + Grid.endSelect.x) / 2);
                Session.set('menu.y', (Grid.startSelect.y + Grid.endSelect.y) / 2);

            } else if (Grid.selectLink || e.metaKey || e.ctrlKey) {
                if (this.linked) {

                    Squares.update(Grid.startSelect._id, {
                        $pull: {
                            link: this._id
                        }
                    });

                    Squares.update(this._id, {
                        $set: {
                            linked: false
                        }
                    });

                } else {

                    Squares.update(Grid.startSelect._id, {
                        $push: {
                            link: this._id
                        }
                    });

                    Squares.update(this._id, {
                        $set: {
                            linked: true
                        }
                    });



                }
            } else {

                Grid.startSelect = this;

                Session.set('menu.x', this.x + (this.width - 1) / 2);
                Session.set('menu.y', this.y + (this.height - 1) / 2);


            }
        }
    });

    Session.set('menu.page', 1);

    Template.menu.xpos = function() {
        return Session.get('menu.x') * 100;
    };

    Template.menu.ypos = function() {
        return Session.get('menu.y') * 100;
    };

    Template.menu.isPage = function(p) {
        return Session.get('menu.page') == p;
    };

    Template.menu.nextPage = function() {
        Session.set('menu.page', Session.get('menu.page') + 1);
        _.defer(function() {
            $('.open-close-button').focus();
        });
    };

    Template.menu.prevPage = function() {
        Session.set('menu.page', Session.get('menu.page') - 1);
        _.defer(function() {
            $('.open-close-button').focus();
        });
    };

    Template.menu.events = {
        //Page 1
        'click .edit-button': Action.edit,
        'click .function-button': Action.editFunction,
        'click .url-button': Action.editURL,
        'click .link-button': Action.editLinks,
        'click .next-page-button': Template.menu.nextPage,

        //Page 2
        'click .previous-page-button': Template.menu.prevPage,
        'click .style-button': Action.editStyle,
        'click .merge-button': Action.merge,

        'click .delete-button': Action.delete
    };

    Template.toolbox.events = {
        'click button.add-stencil-button': Action.addStencil,
        'click button.clear-canvas-button': Action.resetCanvas,
        'click .square': Action.copyStencil,
        'dblclick .square': Action.deleteStencil
    }

    Meteor.startup(function() {

        Squares.find({
            selected: true
        }, {
            transform: function(e) {
                Squares.update(e._id, {
                    $set: {
                        selected: false
                    }
                });
            }
        }).fetch();

        //No idea when this will load.
        setTimeout(function() {
            Meteor.Keybindings.add({
                'delete': function(e) {
                    if ($(e.target).is('body')) {
                        e.preventDefault();
                        Action.delete();
                    }
                },
                'backspace': function(e) {
                    if ($(e.target).is('body')) {
                        e.preventDefault();
                        Action.delete();
                    }
                },
                'super+c': function(e) {
                    if ($(e.target).is('body')) {
                        Action.copy();
                    }
                },
                'ctrl+c': function(e) {
                    if ($(e.target).is('body')) {
                        Action.copy();
                    }
                },
                'super+v': function(e) {
                    if ($(e.target).is('body')) {
                        Action.paste();
                    }
                },
                'ctrl+v': function(e) {
                    if ($(e.target).is('body')) {
                        Action.paste();
                    }
                },
                'super+x': function(e) {
                    if ($(e.target).is('body')) {
                        Action.cut();
                    }
                },
                'ctrl+x': function(e) {
                    if ($(e.target).is('body')) {
                        Action.cut();
                    }
                },
                'l': function(e) {
                    if ($(e.target).is('body')) {
                        Action.editLinks();
                    }
                },
                'm': function(e) {
                    if ($(e.target).is('body')) {
                        var count = Squares.find({
                            selected: true
                        }).count();

                        if (count > 1) {
                            Action.merge();
                        } else {

                            Action.split();
                        }
                    }
                },
                'f': function(e) {
                    if ($(e.target).is('body')) {
                        Action.editFunction();
                    }
                },
                'enter': function(e) {
                    if ($(e.target).is('body')) {
                        Action.edit();
                    }
                },
                'r': function(e) {
                    if ($(e.target).is('body')) {
                        Action.refresh(Grid.startSelect);
                    }
                },
                'c': function(e) {
                    if ($(e.target).is('body')) {
                        Action.editStyle();
                    }
                },
                's': function(e) {
                    if ($(e.target).is('body')) {
                        Action.editStyle();
                    }
                },
                'u': function(e) {
                    if ($(e.target).is('body')) {
                        Action.editURL();
                    }
                },
                'up': function(e) {
                    if ($(e.target).is('body')) {
                        Action.moveCursor('up');
                    }
                },
                'down': function(e) {
                    if ($(e.target).is('body')) {
                        Action.moveCursor('down');
                    }
                },
                'left': function(e) {
                    if ($(e.target).is('body')) {
                        Action.moveCursor('left');
                    }
                },
                'right': function(e) {
                    if ($(e.target).is('body')) {
                        Action.moveCursor('right');
                    }
                }
            });

            // $('.loading').remove();

        }, 500);
    });
}

if (Meteor.isServer) {
    var cheerio = Meteor.require('cheerio');

    Meteor.methods({
        fetch: function(url, statements, _id) {

            Meteor.http.get(url, function(error, response) {
                var $, data, fn;

                if (response.headers['content-type'].match(/text\/html/)) {

                    $ = cheerio.load(response.content);
                    fn = new Function(['$', 'ID'], statements);

                } else if (response.headers['content-type'].match(/application\/json/)) {

                    $ = JSON.parse(response.content)
                    fn = new Function(['data', 'ID'], statements);

                }

                Squares.update(_id, {
                    $set: {
                        value: fn($, _id),
                    }
                });
            });
        },
        reset: function() {
            Meteor.call('clear');
            Meteor.call('initialize');
        },
        clear: function() {
            Squares.remove({});
        },
        initialize: function() {
            // Initialize empty cells
            if (Squares.find().count() == 0) {
                for (var i = 0; i < 15; i++) {
                    for (var j = 0; j < 15; j++) {
                        Squares.insert({
                            x: i,
                            y: j,
                            height: 1,
                            width: 1,
                            link: [],
                            selected: false
                        });
                    };
                };
            }
        }
    });

    // Meteor.publish('All', function() {
    //     return [Squares.find({}), Stencils.find({})];
    // })

    Meteor.startup(function() {
        // Meteor.call('clear');
        Meteor.call('initialize');

    });
}
