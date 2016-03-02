var exec = require('child_process').execSync;
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
var request = require('request');
var glob = require("glob")
var gitlab= 'https://gitlab2.prsvr.net'
var pk = 'tKDzhD8sd6uWFhiphKsi'
var project_id =null;
var project_path  = "";
var head ="";

exec("ruby -v ",function(error, stdout, stderr){
    console.log(error, stdout, stderr);
});
var stdout = exec("git rev-parse HEAD")
head = stdout.toString().replace("\n","");
request({
    url:gitlab+"/api/v3/projects/all?order_by=last_activity_at",
    headers:{
        "PRIVATE-TOKEN":pk
        }
    },function(err,response,body){
        JSON.parse(body).forEach(function(project){
            var stdout = exec("git config --get remote.origin.url");
            if(project["ssh_url_to_repo"] == stdout.toString().replace("\n","")){
                project_id = project["id"];
                project_path = project["path_with_namespace"];
                console.log("phpcs");
                phpCodeSniffer();
                console.log("rubocop");
                ruboCop();
                console.log("reek");
                reek();
                console.log("railsBestPractices");
                railsBestPractices();

            }
        })
    }
)

function phpCodeSniffer(){
    glob("**/*.php",function(err,files){
        files.forEach(function(file){
            var stdout = exec("php phpcs.phar "+file+" --extensions=php");
            var results = stdout.split("\n");
            results.forEach(function(line){
                if(line.match(/\[(.*?)\]/)){
                    var parsed = line.match(/([0-9]+) \|(.*)/);
                    gitLabComment(file,parsed[1],parsed[2]);
                }
            })
        })
    })
}
function ruboCop(){
    glob("**/*.rb",function(err,files){
        files.forEach(function(file){
            var stdout = exec("rubocop "+file);
            var results = stdout.split("\n");
            results.forEach(function(line){
                if(line.match(/\.rb:[0-9]+:/)){
                    var parsed = line.match(/\.rb:([0-9]+):[0-9]+: (.*)/);
                    gitLabComment(file,parsed[1],parsed[2]);
                    }
            })
        });
    })
}

function railsBestPractices(){
    glob("**/*.rb",function(err,files){
        files.forEach(function(file){
            var stdout = exec("rails_best_practices ");
            var results = stdout.split("\n");
            console.log(results)
            results.forEach(function(line){
                if(line.match(/\.rb:[0-9]+ -/)){
                    var parsed = line.match(/\.rb:([0-9]+) - (.*)/);
                    gitLabComment(file,parsed[1],parsed[2]);

                }
            })
        })
    })
}
function reek(){
    glob("**/*.rb",function(err,files){
        async.each(files,function(file){
            var stdout = exec("reek  "+file);
            var results = stdout.split("\n");
            console.log(results)
            results.forEach(function(line){
                if(line.match(/\[(.*?)\]/)){
                    console.log();
                    line.match(/\[(.*?)\]/)[1].match(/([0-9]+)/g).forEach(function(num){
                        gitLabComment(file,num,line);
                    })
                }
            });
        })
    });
}

function gitLabComment(file,line,comment){
    var stdout = exec("git blame --abbrev=100 "+file);
    if(!stdout.toString().match(new RegExp(".*( "+line+"\\))"))){
        console.log(file,line,comment);
        return;
    }

    var hash = stdout.toString().match(new RegExp(".*( "+line+"\\))"))[0].match(/^(.{40,41}) /)[1]
    hash = hash.replace("^","");
    request({
        method:"POST",
        url:gitlab+"/api/v3/projects/"+project_id+"/repository/commits/"+hash+"/comments",
        headers:{
            "PRIVATE-TOKEN":pk
        },
        form:{
            note:comment,
            line:line,
            path:file,
            line_type:"new"
        }
    })
}
