var get = function get(uri, callback, onError) {
    var request = new XMLHttpRequest();
    request.addEventListener('load', function() {
        callback(request.responseText);
    });
    request.addEventListener('error', onError);
    request.open('GET', uri);
    request.send();
};
var evaluate = function evaluate(js) {
    var buffer = [];
    // Save the old console.log function
    var oldLog = console.log;
    console.log = function(s) {
        // Push log output into a temporary buffer
        // which will be returned to PSCi.
        buffer.push(s);
    };
    // Replace any require and import statements with lookups on the PSCI object
    // and export statements with assignments to module.exports.
    var replaced = js.replace(/require\("[^"]*"\)/g, function(s) {
        return "PSCI['" + s.split('/')[1] + "']";
    }).replace(/import \* as ([^\s]+) from "([^"]*)"/g, function (_, as, from) {
        return "var " + as + " = PSCI['" + from.split('/')[1] + "']";
    }).replace(/export \{([^}]+)\} from "\.\/foreign\.js";?/g, function (_, exports) {
        return exports.replace(/^\s*([^,\s]+),?\s*$/gm, function (_, exported) {
            return "module.exports." + exported + " = $foreign." + exported + ";";
        });
    }).replace(/export \{([^}]+)\};?/g, function (_, exports) {
        return exports.replace(/^\s*([^,\s]+)(?: as ([^\s]+))?,?\s*$/gm, function (_, exported, as) {
            return "module.exports." + (as || exported) + " = " + exported + ";";
        });
    });
    // Wrap the module and evaluate it.
    var wrapped =
      [ 'var module = { exports: {} };'
      , '(function(module) {'
      , replaced
      , '})(module);'
      , 'return module.exports["$main"] && module.exports["$main"]();'
    ].join('\n');
    new Function(wrapped)();
    // Restore console.log
    console.log = oldLog;
    return buffer.join('\n');
};
window.onload = function() {
    var socket = new WebSocket('ws://localhost:' + location.port);
    var evalNext = function reload() {
        get('js/latest.js', function(response) {
            try {
                var result = evaluate(response);
                socket.send(result);
            } catch (ex) {
                socket.send(ex.stack);
            }
        }, function(err) {
            socket.send('Error sending JavaScript');
        });
    };
    socket.onopen = function() {
        console.log('Connected');
        socket.onmessage = function(event) {
            switch (event.data) {
                case 'eval':
                    evalNext();
                    break;
                case 'reload':
                    location.reload();
                    break;
            }
        };
    };
};
