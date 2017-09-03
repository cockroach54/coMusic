var express = require('express'); //http://expressjs.com/ko/4x/api.html#res.send
var app = express();
var bodyParser = require('body-parser');
var session = require('express-session');
var FileStore = require('session-file-store')(session);
var path = require('path');
var opt = {path: path.resolve(__dirname, 'sessions'), ttl:100000};
//cafe24
//var opt = {path:'/home/hosting_users/lsw0504/apps/lsw0504_comusic/sessions', ttl: 10000};


app.set('view engine', 'ejs');
//cafe24 절대경로
//app.set('views', '/home/hosting_users/lsw0504/apps/lsw0504_comusic/views');
app.set('views', path.resolve(__dirname, 'views'));
//maxAge설정해놔야 세션 금방 자동삭제안됨 - 아님 이건 쿠키만료일임 ㅜㅜ
app.use(session({
    resave:false, saveUninitialized:false, secret:'Secret Key', maxAge: Date.now()+(2 * 3600 * 1000), store:new FileStore(opt)
}));

app.use(bodyParser.urlencoded({extended:false})); //extended 반드시 명기

var os = require('os');
var request = require('request');
var cheerio = require('cheerio');
var querystring = require('querystring');

//-----------유투브 다운로드
var fs   = require('fs');
var rimraf = require('rimraf'); //fs.rmdir은 폴더안에 파일있으면 못지움
var ytdl = require('ytdl-core');

//var req.session.genieRes = {};   //지니 크롤링 결과 담을 전역객체

//-----------audioList.json
var audioList=[];
// 접속때마다 audioList갱신
function readAudioList(){
    //var audios = fs.readFileSync('./home/hosting_users/lsw0504/apps/lsw0504_comusic/audioList.json'); //cafe24 
    var audios = fs.readFileSync(path.resolve(__dirname, 'audioList.json'));
    audioList = JSON.parse(audios);
}
//post요청 뒤에 디비 업데이트
function saveToJson(){
//alert("정말 저장하겠습니까?"), confirm(), prompt()여기서 무용지물, 프론트에서 사용
//cafe24
//    fs.writeFile('./home/hosting_users/lsw0504/apps/lsw0504_comusic/audioList.json', JSON.stringify(audioList), function(err){
    fs.writeFile(path.resolve(__dirname, 'audioList.json'), JSON.stringify(audioList), function(err){
        if(err){
            console.error('save json file failed!');
            return;
        }
        else console.log('save json file completed.');
    });
}

//----------ip주소 가져와서 클라이언트에게 던져주기
var interfaces = os.networkInterfaces();
var addresses = [];
//var port = 4000;
var port = 8001; //cafe24 port번호 8001
for (var k in interfaces) {
    for (var k2 in interfaces[k]) {
        var address = interfaces[k][k2];
        if (address.family === 'IPv4' && !address.internal) {
            addresses.push(address.address);
            addresses.push(':'+port);            
        }
    }
}
console.log(addresses); //[0] = ip, [1] = port
//cafe24
//app.use(express.static('./home/hosting_users/lsw0504/apps/lsw0504_comusic/'));
//-----------라우팅 필요
app.use(express.static(path.resolve(__dirname)));

app.get('/audioList', function(req, res){
    var date = new Date;
    audioObj={
        length:audioList.length,
        date:date.getDay()+' ' +date.getHours()+':'+date.getMinutes()+':'+date.getSeconds(),
        audioList:audioList
    };
    res.send(JSON.stringify(audioObj));
    console.log(JSON.stringify(audioObj));
});
app.get('/youtubeVideos/:id', function(req, res){
    var id = req.params.id;
    var cnt = -99; //-99나오면 에러임
    if(req.session.genieRes.video[id]){
        console.log('CASHED');
        audioList.forEach(function(item){''
            if(item.videoId==req.session.genieRes.video[id]){
                item.cnt++; //조회수 증가
                saveToJson();
                cnt = item.cnt;
            }
        });
        res.send({videoId:req.session.genieRes.video[id], idx:id, name:req.session.genieRes.name[id], song:req.session.genieRes.song[id], dur:req.session.genieRes.duration[id], cnt:cnt});
        return;
    }
    else beforeSearch(req, res, id);
});

//비동기 병렬처리 위해 대기함수 만들어놈
var isSearching = false;
function beforeSearch(req, res, id){
    if(isSearching) setTimeout(function(){ //먼저 다운중이면 0.5초후 다시 요청
        console.log('@@STILL SEARCHING PREVIOUS FILE IN YOUTUBE@@');
        beforeSearch(req, res, id);
    }, 500);
    else getOneFromYoutube(req, res, id);
}

app.get('/genieLyrics/:id', function(req, res){
    var id = req.params.id;
    getLyrics(req.session.genieRes, id, res);
});
app.get('/naverNews/:id', function(req, res){
    var id = req.params.id;
    getNews(req.session.genieRes, id, req, res);
});
//병렬처리 혼선 없도록 도록 최대한 세션으로 저장
app.post('/getMp3', function(req, res){
    req.session.videoId = req.body.videoId;
    req.session.title = req.body.title;
    req.session.idx = req.body.idx*1;
    req.session.dur = req.body.dur*1;
    
    console.log('post/getMp3',req.session.videoId, req.session.title, req.session.idx);    
    req.session.genieRes.video[req.session.idx] = req.session.videoId;
    req.session.genieRes.duration[req.session.idx] = req.session.dur;
    req.session.videoArr = new Array(req.session.genieRes.song.length);
    req.session.videoArr.splice(req.session.idx,1,req.session.videoId);

    beforeGet(req.session.videoArr, req.session.idx, req, res);
});
//비동기 병렬처리 위해 대기함수 만들어놈
var isDownloading = false;
function beforeGet(videoArr, idx, req, res){
    if(isDownloading) setTimeout(function(){ //먼저 다운중이면 1.5초후 다시 요청
        console.log('@@STILL DOWNLOADING PREVIOUS FILE@@');
        beforeGet(videoArr, idx, req, res);
    }, 1500);
    else{
        getMp3(videoArr, idx, idx+1, req, function(){
            res.send('200');
        });
    }
}

////관리자 권한으로 자료 모두 삭제
//app.get('/deleteall/:admin', function(req, res){
//    var adminId = req.params.admin;
//    if(adminId == 'lsw0504'){
//        deleteAll(audioList);
//        res.send('deleted all files and initalized json file.')
//    }
//    else res.status(401).send('Unauthorized access');
//});
//관리자 권한으로 audioSample폴더 삭제
app.get('/deletedir/:admin', function(req, res){
    var adminId = req.params.admin;
    if(adminId == 'lsw0504'){
        deleteDir();
        res.send('deleted "audioSample" and initalized json file.')
    }
    else res.status(401).send('Unauthorized access');
});
//
app.post('/deletenull', function(req, res){
    var errTitle = req.body.errTitle;
    deleteNull(audioList, errTitle);
    res.send('deleted "null list" and initalized json file.');
});
//관리자 권한으로 top50전부 받아오기 
app.get('/getall/:admin', function(req, res){
    var adminId = req.params.admin;
    if(adminId == 'lsw0504'){
        //1. 유투브 한번에 모두 받아오기, 속도 때문에 막아둠
        makeFirstPage(req, res, function(){
            getFromYoutube(req, res, req.session.genieRes.song.length);        
        });
    }
    else res.status(401).send('Unauthorized access');
});
app.get('/', function(req, res){
    isDownloading = false; // 비정상 종료시 계속 다운로드 중이라고 뜨는거 방지
    readAudioList();
    //접속한 클라이언트 IP 기록
    var remoteIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log('#### CLIENT CONNECTED',remoteIP,'####');
    //2. 한번에 하나씩 받아오기, 위랑 둘중 하나만 사용. getOneFromYoutube()사용
    makeFirstPage(req, res, 1, function(){
        res.render('webCrawlingM', {item: req.session.genieRes});
    });
});
app.get('/pages/:num', function(req, res){
    var page = req.params.num * 1;
    makeMidAjax(req, res, page, function(){
        //res.render('webCrawlingM', {item: req.session.genieRes});
        res.send(req.session.genieRes);
    });
});
app.get('/stillhere', function(req, res){
    var remoteIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    //cafe24 끄기
    //console.log('#### CLIENT STILL CONNECTED',remoteIP,'####');
    res.send(remoteIP);
});

app.listen(port);

//지니 크롤링 후 홈페이지 불러오는 함수
function makeMidAjax(req, res, page, callback){
    var resultImg = req.session.genieRes.img;
    var resultName = req.session.genieRes.name;
    var resultSong = req.session.genieRes.song;
    var resultSongNum = req.session.genieRes.songNum;
    //지니뮤직 today top100
    if(page==1) uri= 'http://www.genie.co.kr/chart/top100';
    else uri= 'http://www.genie.co.kr/chart/top100/?pg=2';
    request({uri: uri, encoding:'binary'},
    function(err, re, body){
        var buffer = new Buffer(body, 'binary');
        var album = [];
        var $ = cheerio.load(buffer);
        $('img', 'div.list-wrap').each(function(i, el){
           //console.log(this); 
            var img = $(this).attr('src');
            //아이콘 제거
            if(img.indexOf('flac.png')<0){
                album.push(img);
                if(page==1) resultImg.splice(album.length-1, 1, album[album.length-1]);                
                else resultImg.splice(album.length-1+50, 1, album[album.length-1]);;
            }
        });
        $('a.artist', 'div.list-wrap').each(function(i, el){
           //console.log(this); 
            var name = $(this).text();
            name = name.replace(/\\|\/|:|\*|\?|"|<|>|\|/g, "");
            if(page==1) resultName.splice(i, 1, name);
            else resultName.splice(i+50, 1, name);
        });
        $('a.title', 'div.list-wrap').each(function(i, el){
           //console.log(this); 
            var song = $(this).text();
            song = song.replace(/\\|\/|:|\*|\?|"|<|>|\|/g, "");
            if(page==1) resultSong.splice(i, 1, song);
            else resultSong.splice(i+50, 1, song);
        });
        $('div.list-wrap').children('div').each(function(i, el){
            //this===el, 단 $()안에 넣어야힘
            var songNum = $(el).attr('songid');
            if(page==1) resultSongNum.splice(i, 1, songNum);
            else resultSongNum.splice(i+50, 1, songNum);
        });
        return callback();
    });
}
//지니 크롤링 후 홈페이지 불러오는 함수
function makeFirstPage(req, res, page, callback){
    var resultImg = new Array(100);
    var resultName = new Array(100);
    var resultSong = new Array(100);
    var resultSongNum = new Array(100);
    //지니뮤직 today top100
    if(page==1) uri= 'http://www.genie.co.kr/chart/top100';
    else uri= 'http://www.genie.co.kr/chart/top100/?pg=2';
    request({uri: uri, encoding:'binary'},
    function(err, re, body){
        var album = [];
        var buffer = new Buffer(body, 'binary');
        var $ = cheerio.load(buffer);
        $('img', 'div.list-wrap').each(function(i, el){
           //console.log(this); 
            var img = $(this).attr('src');
            //아이콘 제거
            if(img.indexOf('flac.png')<0) album.push(img);
            resultImg.splice(album.length-1, 1, album[album.length-1]);
        });
        $('a.artist', 'div.list-wrap').each(function(i, el){
           //console.log(this); 
            var name = $(this).text();
            name = name.replace(/\\|\/|:|\*|\?|"|<|>|\|/g, "");
            resultName.splice(i, 1, name);
        });
        $('a.title', 'div.list-wrap').each(function(i, el){
           //console.log(this); 
            var song = $(this).text();
            song = song.replace(/\\|\/|:|\*|\?|"|<|>|\|/g, "");
            resultSong.splice(i, 1, song);
        });
        $('div.list-wrap').children('div').each(function(i, el){
            //this===el, 단 $()안에 넣어야힘
            var songNum = $(el).attr('songid');
            resultSongNum.splice(i, 1, songNum);
        });

        req.session.genieRes={
            ipAdd: addresses, //서버ip저장
            img:resultImg, //지니 앨범재킷 리소스 주소 
            name:resultName, //지니 가수명
            song:resultSong, //지니 곡명
            songNum:resultSongNum, //지니 노래고유번호 저장
            video: new Array(100), //유튜브 비디오번호 저장
            duration: new Array(100), //비디오 재생시간 저장
            news: new Array(100) //네이버 뉴스 저장
        }
        return callback();
    });
}
//result가 매개변수로 들어감, 비동기로 재귀호출하므로 이 함수 마지막에 렌더해야함
//지금은 로딩 속도 문제로 하나씩 ajax콜하므로 안씀
function getFromYoutube(req, res, length){
    if(length==0){
//        console.log('**********result.video***********');
//        console.log(req.session.genieRes.video);
        res.render('webCrawlingM', {item: req.session.genieRes});
        getMp3(req.session.genieRes.video, 0, req.session.genieRes.video.length,  req, function(){});
        return;
    }
    else{
        var idx = req.session.genieRes.name.length-length; 
        var name = req.session.genieRes.name[idx];
        var song = req.session.genieRes.song[idx];
        var search = name+" "+song;

        var queryObj={
            part:'id',
            maxResults:3,
            order:'relevance',
            q:search,
            regionCode:'kr',
            safeSearch:'none',
            type:'video',
            videoDuration:'any',
            videoEmbeddable:'any',
            videoLicense:'any',
            videoSyndicated:'any',
            videoType:'any',
            key:'AIzaSyBAR5UuNCvLNZRe6Elp3RzPz2FSRksTTZ8',
        };
        var queryStr = querystring.stringify(queryObj);
        var url = 'https://www.googleapis.com/youtube/v3/search?'+queryStr;
        console.log('=================');
        console.time('SEARCH TIME');
        request.get({url:url}, function(err, re, body){
            console.timeEnd('SEARCH TIME');
            try{
                body = JSON.parse(body);
                var videoId = body.items[0].id.videoId;
                var videoArr = [];
                body.items.forEach(function(el){
                    videoArr.push(el.id.videoId);
                });
                console.log(videoArr);
                compareDur(videoArr,0, function(videoId_s, tot){
                    console.log('Success: no.', idx ,search, videoId_s);
                    req.session.genieRes.video.splice(idx,1,videoId_s);
                    req.session.genieRes.duration.splice(idx,1,tot);
                    return getFromYoutube(req, res, length-1); //재귀호출
                });
            }
            catch(err){
                console.log('Error: no.', idx, search);
                req.session.genieRes.video.splice(idx,1,'error');
                req.session.genieRes.duration.splice(idx,1,0);
                return getFromYoutube(req, res, length-1); //재귀호출
            }
        });
    }
}
//유투브에서 하나만 조회
function getOneFromYoutube(req, res, id){
    isSearching = true;
    var idx = id;
    var name = req.session.genieRes.name[idx];
    var song = req.session.genieRes.song[idx];
    var search = name+" "+song;
    var queryObj={
        part:'id',
        maxResults:3,
        order:'relevance',
        q:search,
        regionCode:'kr',
        safeSearch:'none',
        type:'video',
        videoDuration:'any',
        videoEmbeddable:'any',
        videoLicense:'any',
        videoSyndicated:'any',
        videoType:'any',
        key:'AIzaSyBAR5UuNCvLNZRe6Elp3RzPz2FSRksTTZ8',
    };
    var queryStr = querystring.stringify(queryObj);
    var url = 'https://www.googleapis.com/youtube/v3/search?'+queryStr;
    console.log('=================');
    console.time('SEARCH TIME');
    request.get({url:url}, function(err, re, body){
        console.timeEnd('SEARCH TIME');
        try{
            body = JSON.parse(body);
            var videoId = body.items[0].id.videoId; //???
            var videoArr = [];
            body.items.forEach(function(el){
                videoArr.push(el.id.videoId);
            });
            console.log(videoArr);
            compareDur(videoArr,0, function(videoId_s, tot){
                console.log('Success: no.', idx ,search, videoId_s);
                req.session.genieRes.video.splice(idx,1,videoId_s); //캐시해서 나중에 안찾도록
                req.session.genieRes.duration.splice(idx,1,tot); //캐시해서 나중에 안찾도록
                res.send({videoId:videoId_s, idx:idx, name:name, song:song, dur:tot});
                isSearching = false;
            });
        }
        catch(err){
            console.log('Error: no.', idx, search);
            req.session.genieRes.video.splice(idx,1,'error');
            req.session.genieRes.duration.splice(idx,1,0);
            res.send({videoId:'error', idx:idx, name:name, song:song, dur:0}); // 나중에 에러처리 제대로 하자
            isSearching = false;
        }
    });
}
//티저영상, 편집영상 걸러내기. videoArr인풋해서 callback으로 적절한 videoId, tot 리턴, i는 배열 검색 시작 인덱스
function compareDur(videoArr, i, calllback){
    if(i==videoArr.length) return calllback(videoArr[0], tot); //적당한거 없음 그냥 맨 처음걸로 
    var tot = 0;
    var queryObj={
            id: videoArr[i],
            key:'AIzaSyBAR5UuNCvLNZRe6Elp3RzPz2FSRksTTZ8',
            part:'snippet,contentDetails'
        };
    var queryStr = querystring.stringify(queryObj);
    var url = 'https://www.googleapis.com/youtube/v3/videos?'+queryStr;
    request.get({url:url}, function(err, re, body){
        console.log('******duration******');
        try{
            body = JSON.parse(body);
            var dur = body.items[0].contentDetails.duration;
            //dur 초단위로 변경
            dur = dur.replace('PT','');
            var min = 0;
            var sec = 0;
            if(dur.indexOf('M')) min = dur.substring(0, dur.indexOf('M'))*1;
            if(dur.indexOf('S')) sec = dur.substring(dur.indexOf('M')+1, dur.indexOf('S'))*1;

            tot = min*60+sec;
            console.log('tot: ',tot, ' min: ',min, ' sec',sec);
            if(tot>300||tot<120) return compareDur(videoArr, i+1, calllback);
            else return calllback(videoArr[i], tot); //리턴이 request만 벗어나면 문제됨
        }
        catch(err){
            console.log('compareDur err....',err);
            return compareDur(videoArr, i+1, calllback);
        }
    });
}
//지니에서 가사 가져오기
function getLyrics(src, id, res){
    var songNum = src.songNum[id];
    var url = 'http://www.genie.co.kr/detail/songInfo?xgnm='+songNum;
    request({uri:url, encoding:'binary'},
    function(err, re, body){
        var buffer = new Buffer(body, 'binary');
        var $ = cheerio.load(buffer);
        var lyrics = $('p#pLyrics').text();
        //console.log(url, lyrics);
        //가사를 문자열로 리턴
        res.send(lyrics);
    });
}
//네이버에서 이미지와 뉴스 가져오기, 이미지검색> 이미지링크,타이틀획득>다시 뉴스검색>뉴스링크획득. 최대 4개까지 가져옴 
function getNews(src, id, req, res){
    if(src.news[id]){ //캐시처리, 이미 찾은거면 다시 안찾음
        res.end();
        return;
    }
    var search = src.name[id]+" "+src.song[id];
    var queryObj = {
        query:search,
        display:4,
        start:1,
        sort:'sim',
        filter:'all',
    };
    var headers = {
        'X-Naver-Client-Id' : '8uQ6X5DjRxIj675qRDtK',
        'X-Naver-Client-Secret' : '9DUI9S6Nq5'
    };
    //검색결과 저장 객체
    var newsObj={
        title:new Array(),
        imgLink:new Array(),
        newsSmry:new Array(),
        newsLink:new Array()
    };

    var queryStr = querystring.stringify(queryObj);
    var url = 'https://openapi.naver.com/v1/search/image.json?'+queryStr;
    console.time('IMAGE SEARCH TIME');
    request.get({url:url, headers:headers}, function(err, re, body){
        console.timeEnd('IMAGE SEARCH TIME');
        try{
            console.log(id);
            console.log(search);
            body = JSON.parse(body);
            body.items.forEach(function(item){
                newsObj.title.push(item.title);
                newsObj.imgLink.push(item.link);
            });
            src.news.splice(id,1,newsObj); //캐시해서 나중에 안찾도록
        }
        catch(err){
            console.log('Error: ');
        }
        //여기부터 뉴스서치
        getNewslink(newsObj, newsObj.title.length, req, res);
    });
}
//getNews()에서 가져온 이미지 타이틀로 뉴스검색
function getNewslink(newsObj, length, req, res){
    var idx = newsObj.title.length - length;
    var search = newsObj.title[idx];
    var queryObj = {
        query:search,
        display:1,
        start:1,
        sort:'sim',
    };
    var headers = {
        'X-Naver-Client-Id' : '8uQ6X5DjRxIj675qRDtK',
        'X-Naver-Client-Secret' : '9DUI9S6Nq5'
    };
    
    if(length<0){
        console.log(newsObj);
        console.log(req.session.genieRes);
        res.send(newsObj);
        return;
    }

    var queryStr = querystring.stringify(queryObj);
    var url = 'https://openapi.naver.com/v1/search/news.json?'+queryStr;
    console.time('NEWS SEARCH TIME');
    request.get({url:url, headers:headers}, function(err, re, body){
        console.timeEnd('NEWS SEARCH TIME');
        try{
            //console.log(body);
            body = JSON.parse(body);
            body.items.forEach(function(item){
                newsObj.newsSmry.push(item.description);
                newsObj.newsLink.push(item.originallink);
            });
        }
        catch(err){
            console.log('Error: ');
        }
        length--;
        getNewslink(newsObj, length, req, res); //recursive call
    });
    
}
//videoArr배열에 있는 비디오주소들을 startIdx부터 length갯수만큼 차례로 다운로드
function getMp3(videoArr, startIdx, length, req, callback){ //재귀호출    
    isDownloading = true;
    if(startIdx==length){
        //cafe24 //process접근 못함. //process.stdout.write모두 주석처리. 아래도 4개 있음
        //process.stdout.write('Download end.\n');
        isDownloading = false;
        return callback();
    }
    
    var videoId = videoArr[startIdx];
    var url = 'https://www.youtube.com/watch?v='+videoId;
    
    ytdl.getInfo(url, function(err, info){ //비디오 정보검색
        var formats = info.formats;
        var itagArr=[];
        formats.forEach(function(item){
           if(item.itag==140||item.itag==249||item.itag==250||item.itag==251){
               itagArr.push(item.itag); //문자열로 바뀜
           }
        });
        console.log(url, itagArr);
        
        //itag 선정, 만약 적당한 포맷이 없으면 er처리
        var itag;
        if(itagArr.indexOf('249')>-1) itag = 249;
        else if(itagArr.indexOf('250')>-1) itag = 250;
        else if(itagArr.indexOf('251')>-1) itag = 251;
        else if(itagArr.indexOf('140')>-1) itag = 140;
        else itag = 'er';
        if(itag=='er'){
            itag = 140;
            url = 'https://www.youtube.com/watch?v='+yKINPsgL1eg//일단은 포맷없으면 파일 안만듦, 나중에 플레이어에서 디폴트 음원 대타 처리 -> officially misssing you too
        }
        
        console.log('itag:', itag);
        var opt={quality:itag};
        //디렉토리패쓰에 있으면 안되는 문자 제거 '?' 등..
        var title = req.session.genieRes.name[startIdx]+" "+req.session.genieRes.song[startIdx]+'.mp3';
        title = title.replace(/\\|\/|:|\*|\?|"|<|>|\|/g, ""); //특수문자 제거
        var output = path.resolve(__dirname, 'audioSample', title);
        
        
        //재다운로드 방지, 조회수 증가.
        for(var i=0; i<audioList.length; i++){
            if(audioList[i].videoId == videoId){
                //process.stdout.write('##'+videoId+': already downloaded video!##\n');
                audioList[i].cnt++;
                saveToJson();
                startIdx++;
                console.log('##aleady have videoId',videoId,'in audioList##');
                isDownloading = false;
                return getMp3(videoArr, startIdx, length, req, callback);
            }
        }
        
        var video = ytdl(url, opt);
        video.pipe(fs.createWriteStream(output));
        video.on('progress', function(chunkLength, downloaded, total) {
            //process.stdout.cursorTo(0);
            //process.stdout.clearLine(1);
            //process.stdout.write((downloaded / total * 100).toFixed(2) + '% ');
        });
        video.on('end', function() {
            //json파일 저장, 앞에서 못거른 중복 한번더 거름
            var iHaveIt = false;
            audioList.forEach(function(item){
                if(item.title == title){
                    item.cnt++;
                    saveToJson();
                    iHaveIt = true;
                }
            });
            if(!iHaveIt){
                audioList.push({videoId:videoId, title:title, id:startIdx, dur:req.session.genieRes.duration[startIdx], cnt:1});
                saveToJson();
            }
            
            //process.stdout.write(videoId+'\n');
            startIdx++;
            isDownloading = false;
            return getMp3(videoArr, startIdx, length, req, callback);
        });
    });
}
//mp3전부 삭제, audioList.json파일 초기화
function deleteAll(list){ //동기식으로 작동
    var cnt=0;
    list.forEach(function(item){
        //cafe24  
//        var path = './home/hosting_users/lsw0504/apps/lsw0504_comusic/audioSample/'+item.title;
        var path = path.resolve(__dirname, 'audioSample', item.title);
        try{
            fs.unlinkSync(path);
            cnt++;
            console.log('deleted: ', path);
        }
        catch(err){
            console.log('failed...', err);
        }
        //console.log(path);
    });
    console.log(cnt,'files deleted and',list.length-cnt,'files errored!');
    audioList =[]; //전역객체로 접근해야함
    saveToJson();
}
//폴더 자체를 삭제후 재생성
function deleteDir(){
    //cafe24
//    var pathVal = './home/hosting_users/lsw0504/apps/lsw0504_comusic/audioSample';
    var pathVal = path.resolve(__dirname, 'audioSample');
    rimraf(pathVal, function (){
        console.log('deleted dir:',pathVal);
        fs.mkdirSync(pathVal);
        console.log('made empty dir:',pathVal);
        audioList =[]; //전역객체로 접근해야함
        saveToJson();
    });
}
//null값, 잘못된 제목들 audioList에서 삭제
function deleteNull(list, errTitle){
    console.log('-------delete below-------');
    list.forEach(function(item, i){
        var isDeleted = false;
        for (key in item){ //null 제거
            if(!isDeleted && //중복제거 방지 
               (!item[key] || item[key].toString().indexOf('null')==-1)){
                console.log(item);
                list.splice(i, 1);
                isDeleted = true;
            }
        }
        if(!isDeleted){
            if(!errTitle || item.title.indexOf(errTitle)>-1){ //이름 잘못된거 제거
                console.log(item);
                list.splice(i, 1);
            }
        }
    });
    console.log('--------------------------');
    saveToJson();
}
