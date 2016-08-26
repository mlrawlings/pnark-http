var url = require('url')
var instrumitter = require('instrumitter')
var httpEvents = instrumitter('http').watch('request').on('request:return', fn => {
    fn.return.value.on('response', response => {
        var time = instrumitter.time()
        fn.response = {
            value:response,
            time,
            elapsed:time - fn.time
        }
    })
})

module.exports = pnark => {
    pnark.addReporter('http', httpReporter)
}

var httpReporter = report => {
    report.title('http')
    report.collect(httpEvents, 'request', { stack:true }).then(requests => {
        requests = requests.map((r, i) => {
            var data = {
                id:'r-'+i,
                request:r.return.value,
                url:typeof r.arguments[0] == 'string' ? url.parse(r.arguments[0]) : r.arguments[0],
                start:r.time,
                stack:r.stack
            }

            if(r.response) {
                data.response = r.response.value
                data.status = r.response.value.statusCode
                data.elapsed = r.response.elapsed.toFixed(3)
                data.finish = r.time + r.response.elapsed
            }

            return data
        })

        var chartData = getChartData(report, requests)
        var requestsSection = report.section('HTTP Request Timing').chart(chartData)
        requests.forEach(request => {
            var section = requestsSection.section((request.url.protocol||'http:')+'//'+request.url.host, request.id)
            section.html('<strong>'+(request.method||'GET')+'</strong> '+(request.path||'/'))
            section.json(request.request._headers)
            if(request.response) {
                section.html('<strong>'+request.response.statusCode+' Response in '+request.elapsed+'ms:</strong> '+request.response.statusMessage)
                section.json(request.response.headers)
            }
            section.html('<strong>Call Stack</strong>')
            section.html('<p>'+request.stack.map(x => {
                var str = (x.name||'')+' '+x.file+':'+x.line+':'+x.char
                if(isProjectFile(x)) {
                    str = '<strong>'+str+'</strong>'
                }
                return str
            }).join('<br>')+'</p>')
        })

        report.end()
    })
}

function isProjectFile(x) {
    return x.file && x.file.indexOf('/') != -1 && x.file.indexOf('node_modules') == -1
}

function getChartData(report, requests) {
    return {
        chart: {
            type: 'columnrange',
            inverted: true
        },

        title: {
            text: 'HTTP Requests'
        },

        subtitle: {
            text: 'HTTP Requests Triggered by Current Request'
        },

        xAxis: {
            categories: requests.map(request => {
                return {
                    id:request.id,
                    elapsed:request.elapsed,
                    status:request.status,
                    host:request.url.host,
                    path:request.url.path,
                    method:request.url.method
                }
            }),
            labels: {
                formatter: function() {
                    return this.value.host
                }
            }
        },

        yAxis: {
            title: {
                text: 'Timing (ms)'
            },
            min: 0,
            max: report.elapsed
        },

        tooltip: {
            useHTML: true,
            formatter: function() {
                var request = this.key
                return [
                    '<strong>',
                    request.method,
                    '</strong>',
                    ' ',
                    request.host,
                    ' => ',
                    request.status,
                    ' in ',
                    request.elapsed,
                    'ms'
                ].join('')
            }
        },

        plotOptions: {
            series: {
                point: {
                    events:{
                        click: function() {
                            document.getElementById(this.category.id).scrollIntoView()
                        }
                    }
                },
                cursor:'pointer'
            }
        },

        legend: {
            enabled: false
        },

        series: [{
            name: 'Timing',
            data: requests.map(r => [r.start, r.finish])
        }]
    }
}