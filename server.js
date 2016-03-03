var http = require('http');
var fs = require('fs');
http.createServer(function (req, res) {
    var data="";
    req.on('data', function(chunk) {
        data += chunk;
    });

    req.on('end', function () {
        var request = JSON.parse(data);
        console.log();
        fs.appendFileSync("queue",request.repository.url+"\n");
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('oreci');
    });

}).listen(process.env.PORT, '127.0.0.1');
