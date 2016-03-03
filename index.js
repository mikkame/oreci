var exec = require('child_process').execSync;
var fs = require('fs');
var request = require('request');
var glob = require("glob");
var dotenv = require('dotenv');
var url = require("url")

var project_id = null;
var project_path = "";
var head = "";
var cd = process.cwd();
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
var rtg = url.parse(process.env.REDISTOGO_URL);
var redis = require('redis').createClient(rtg.port, rtg.hostname);

var env = {};

function main(repository) {
    process.chdir(cd);
    try {
        fs.unlinkSync("workspace");
    } catch (e) {
        //workspaceが存在しない場合
    }
    exec("git clone " + repository + " workspace");
    process.chdir("workspace");
    env = dotenv.parse(fs.readFileSync('.oreci'));
    if (process.env.SECRET_TOKEN != env.SECRET_TOKEN) {
        return console.log("Token missmatch");
    }
    var stdout = exec("git rev-parse HEAD")
    head = stdout.toString().replace("\n", "");
    request({
        url: env.GITLAB_HOST + "/api/v3/projects/all?order_by=last_activity_at",
        headers: {
            "PRIVATE-TOKEN": env.GITLAB_KEY
        }
    }, function(err, response, body) {
        JSON.parse(body).forEach(function(project) {
            var stdout = exec("git config --get remote.origin.url");
            if (project["ssh_url_to_repo"] == stdout.toString().replace("\n", "")) {
                project_id = project["id"];
                phpCodeSniffer();
                ruboCop();
                reek();
                railsBestPractices();
            }
        })
    })
}



function phpCodeSniffer() {
    glob("**/*.php", function(err, files) {
        files.forEach(function(file) {
            try {
                var stdout = exec("phpcs " + file + " --extensions=php").toString();
            } catch (e) {
                stdout = e.stdout.toString();
            }
            var results = stdout.split("\n");
            results.forEach(function(line) {
                if (line.match(/\[(.*?)\]/)) {
                    var parsed = line.match(/([0-9]+) \|(.*)/);
                    gitLabComment(file, parsed[1], parsed[2]);
                }
            })
        })
    })
}

function ruboCop() {
    glob("**/*.rb", function(err, files) {
        var stdout;
        files.forEach(function(file) {
            try {
                stdout = exec("rubocop " + file).toString();
            } catch (e) {
                stdout = e.stdout.toString();
            }
            var results = stdout.split("\n");
            results.forEach(function(line) {
                if (line.match(/\.rb:[0-9]+:/)) {
                    var parsed = line.match(/\.rb:([0-9]+):[0-9]+: (.*)/);
                    gitLabComment(file, parsed[1], parsed[2]);
                }
            })
        });
    })
}

function railsBestPractices() {
    glob("**/*.rb", function(err, files) {
        files.forEach(function(file) {
            try {
                var stdout = exec("rails_best_practices ").toString();
            } catch (e) {
                stdout = e.stdout.toString();
            }
            var results = stdout.split("\n");

            results.forEach(function(line) {
                if (line.match(/\.rb:[0-9]+ -/)) {
                    var parsed = line.match(/\.rb:([0-9]+) - (.*)/);
                    gitLabComment(file, parsed[1], parsed[2]);

                }
            })
        })
    })
}

function reek() {
    glob("**/*.rb", function(err, files) {
        files.forEach(function(file) {
            try {
                var stdout = exec("reek  " + file).toString();
            } catch (e) {
                stdout = e.stdout.toString();
            }
            var results = stdout.split("\n");
            results.forEach(function(line) {
                if (line.match(/\[(.*?)\]/)) {
                    line.match(/\[(.*?)\]/)[1].match(/([0-9]+)/g).forEach(function(num) {
                        gitLabComment(file, num, line);
                    })
                }
            });
        })
    });
}

function gitLabComment(file, line, comment) {
    var stdout = exec("git blame --abbrev=100 " + file);
    if (!stdout.toString().match(new RegExp(".*( " + line + "\\))"))) {
        return;
    }

    var hash = stdout.toString().match(new RegExp(".*( " + line + "\\))"))[0].match(/^(.{40,41}) /)[1].replace("^", "");
    var form = {
        note: comment,
        line: line,
        path: file,
        line_type: "new"
    };
    var key = JSON.stringify(form);
    redis.get(key, function(err, val) {
        if (err) {
            redis.set(key, 1, function() {
                request({
                    method: "POST",
                    url: env.GITLAB_HOST + "/api/v3/projects/" + project_id + "/repository/commits/" + hash + "/comments",
                    headers: {
                        "PRIVATE-TOKEN": env.GITLAB_KEY
                    },
                    form: form
                })
            });

        }
    })
}



setInterval(function() {
    var queue = fs.readFileSync("queue").toString();
    var current = queue.match(/^.*/);
    fs.writeFileSync("queue", queue.replace(/^.*\n/, ""));
    main(current);
}, 10000)