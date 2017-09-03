console.log('coplayer loaded!');
var player = document.getElementById('coPlayer'); //플레이어 엘리먼트
var trkNum=-1; //현재 재생 트랙넘버
var trkNum_pre; //이전 트랙 넘버
var errCnt = 0; //반복 에러 추정
var page = 1; //현재 페이지
var heartBeat; //30초마다 서버요청 체크
var srcArr = new Array(); // 음원 소스 리스트
//srcArr.push('audioSample/태연 (TAEYEON) Make Me Love You 249.mp3');
var cstmObj = {length:0, date:0, audioList:[]};
//{length:0, date:0, audioList:[{videoId:'', title:'', dur:0, cnt:0}]}

var duration = document.getElementById('dur');
var curTime = document.getElementById('cur');
var trkList = document.getElementById('trkList');

//document.getElementById('title').addEventListener('click', createBanners);
document.body.onload = function(){createBanners(0,50);};

function createBanners(min, max){ //트랙 리스트 탑재 (0, 50) || (50, 100)
    var cnt = 4;
    var randArr = makeSeq(min,max);
    var elArr = new Array(cnt);
    var cntrArr = new Array(cnt);
    for(var i=0; i<cnt; i++){
        elArr[i]=document.createElement('div');
        elArr[i].setAttribute('class', 'cntrS');
        elArr[i].style.backgroundImage = 'url('+document.getElementById('album'+randArr[(max-min-1)-i]).getAttribute('src')+')';
        cntrArr[i]=document.getElementById('cntr'+randArr[i]);
        document.getElementsByClassName('mid')[0].insertBefore(elArr[i], cntrArr[i]);
    }
};

//------------------------audio 이벤트리스너 
player.addEventListener('loadstart', function(){
    console.log('---coplayer loadstart---');
    //제목에 null있는 에러 제거
    if(srcArr[trkNum].indexOf('null')>=0){
        console.log('NO SOUND SOURCE');
        deletenullAjax('zxcv', function(){ //errTitle에 아무문자 전송
            initTrack();
            //모든 audioList.json받아오기, 저장된거 모두 받아와야함
            getAudioList(function(obj){ 
                cstmObj = obj;
                makeList(cstmObj);
                //return skipNext();
            });
        });
        return skipNext();
    }
});
player.addEventListener('loadeddata', function(){
    console.log('---coplayer loaddata---');
    var min = (player.duration / 60)>>0;
    var sec = (player.duration % 60)>>0;
    duration.innerHTML = min+'분 '+sec+'초';
    errCnt = 0; //에러 카운트 초기화
    document.getElementById('loading').style.display='none'; //로딩창 없애기
    
    //다음곡 미리 받으라고 요청
    if(trkNum+1 < srcArr.length){
        var track = srcArr[trkNum+1].replace('/mp3','');
        track = track.replace('audioSample/', '');
        //shake해서 목록 섞으면 srcArr하고 cstmObj하고 순서 달라지니까 보정
        var txId = -1; 
        cstmObj.audioList.forEach(function(item, i){
            if(item.title == track) txId=i;
        });
        console.log('cstmObj:', cstmObj, '\n', 'txId: ', txId);
        var videoObj = {
            videoId:cstmObj.audioList[txId].videoId,
            idx:cstmObj.audioList[txId].id,
            title:cstmObj.audioList[txId].title,
            dur:cstmObj.audioList[txId].dur
        };
        setAudioFile(videoObj, function(stat){
            console.log('status:',stat,',next mp3 download complete!');
            console.log(srcArr[trkNum+1]);
            if(player.currentTime>0.5) return; //이미 다른곡 재생중이면 그냥 리턴. 에러남 
            else player.play();
        });
    }    
});
player.addEventListener('play', function(){
    console.log('---coplayer play---');
    heartBeat = setInterval(sendSignalAjax, 30000); //30초마다 백그라운드 깨우기
    document.getElementById('aa').innerHTML = srcArr[trkNum].replace('audioSample/',''); //현재 재생곡 
    trkNum_pre=trkNum; //이거 없으면 이전곡 추적못함
    trkList.childNodes.forEach(function(item){
        item.style.backgroundColor = 'transparent';
    });
    trkList.childNodes[trkNum].style.backgroundColor='#d1c4e9';
    
    //플레이버튼 일시정지버튼 교체
    document.getElementById('playBtn').style.display='none';
    document.getElementById('pauseBtn').style.display='initial';
    document.getElementById('subPlayBtn').style.display='none';
    document.getElementById('subPauseBtn').style.display='initial';
});
player.addEventListener('timeupdate', function(){
//    if(player.currentTime>35){
//        console.log('20초지남');
//        var event = document.createEvent("HTMLEvents");
//        event.initEvent("ended",true,false);
//        player.dispatchEvent(event);
//    }
});
player.addEventListener('ended', function(){
    console.log('---coplayer ended---');
    // 다음곡 연속재생
    if(heartBeat) clearInterval(heartBeat);
    trkNum++;
    if(trkNum==srcArr.length) trkNum -= srcArr.length;
    player.src=srcArr[trkNum];
    player.play();
});
player.addEventListener('abort', function(){
    console.log('---coplayer abort---');
    //console.log(trkNum_pre, ' aborted');
    trkList.childNodes[trkNum_pre].style.backgroundColor='transparent';
});
//여기서 다운로드요청
player.addEventListener('error', function(){
    console.log('---coplayer error... download mp3 file---');
    //제목에 null있는 에러 제거
    if(srcArr[trkNum].indexOf('null')>=0){
        console.log('NO SOUND SOURCE');
        deletenullAjax('zxcv', function(){ //errTitle에 아무문자 전송
            initTrack();
            //모든 audioList.json받아오기, 저장된거 모두 받아와야함
            getAudioList(function(obj){ 
                cstmObj = obj;
                makeList(cstmObj);
                //return skipNext();
            });
        });
        return skipNext();
    }
    
    errCnt++; //에러카운트 증가
    if(errCnt==3){
        var errTitle = srcArr[trkNum].replace(/audioSample\/|.mp3/, '');
        console.log('@@@@ GET ERROR TITLE',errTitle,'@@@@');
        deletenullAjax(errTitle, null);
        return skipNext();
    }
    document.getElementById('loading').style.display='block'; //로딩창 만들기
    
    var track = srcArr[trkNum].replace('/mp3','');
    track = track.replace('audioSample/', '');
    //shake해서 목록 섞으면 srcArr하고 cstmObj하고 순서 달라지니까 보정
    var txId = -1; 
    cstmObj.audioList.forEach(function(item, i){
        if(item.title == track) txId=i;
    });
    console.log('cstmObj:', cstmObj, '\n', 'txId: ', txId);
    var videoObj = {
        videoId:cstmObj.audioList[txId].videoId,
        idx:cstmObj.audioList[txId].id,
        title:cstmObj.audioList[txId].title,
        dur:cstmObj.audioList[txId].dur
    };
    setAudioFile(videoObj, function(stat){
        console.log('status:',stat,', mp3 download complete!');
        console.log(srcArr[trkNum]);
        player.src=srcArr[trkNum];
        if(player.currentTime>0.5) return; //이미 다른곡 재생중이면 그냥 리턴. 에러남 
        else player.play();
    });
});
player.addEventListener('pause', function(){
    console.log('---coplayer pause---');
    if(heartBeat) clearInterval(heartBeat);
    //플레이버튼 일시정지버튼 교체
    document.getElementById('playBtn').style.display='initial';
    document.getElementById('pauseBtn').style.display='none';
    document.getElementById('subPlayBtn').style.display='initial';
    document.getElementById('subPauseBtn').style.display='none';
});

//-------------- 버튼 이벤트리스너
document.getElementById('playBtn').addEventListener('click', playEvent);
document.getElementById('subPlayBtn').addEventListener('click', playEvent);
                                                    
function playEvent(){
    if(player.src){ //음원소스 있을땐 그대로 재생
        player.play();
        return;
    }    
    if(trkNum==-1) trkNum++;
    if(srcArr[trkNum]){ //재생목록 있을때만 재생 
        player.src=srcArr[trkNum];
        player.play();
    }
    console.log('srcArr: ',srcArr);
    console.log('cstmObj: ',cstmObj);
}

document.getElementById('pauseBtn').addEventListener('click', function(){
    player.pause()
});
document.getElementById('subPauseBtn').addEventListener('click', function(){
    player.pause()
});

document.getElementById('nextBtn').addEventListener('click', skipNext);

function skipNext(){
    trkNum++;
    if(trkNum==srcArr.length) trkNum -= srcArr.length;

    console.log(srcArr[trkNum]);
    player.src=srcArr[trkNum];
    player.play();
}

document.getElementById('preBtn').addEventListener('click', function(){
    trkNum--;
    if(trkNum<0) trkNum = srcArr.length-1;

    console.log(srcArr[trkNum]);
    player.src=srcArr[trkNum];
    player.play();
});

document.getElementById('getAll').addEventListener('click', function(){
    initTrack();
    //모든 audioList.json받아오기, 저장된거 모두 받아와야함
    getAudioList(function(obj){ 
        cstmObj = obj;
        makeList(cstmObj);
        document.getElementById('trkList').scrollTop = 100000; //스크롤 맨 아래로
        
        //목록선택모드 이벤트 자동실행
        if(document.getElementById('selectBtn').style.color!='black'){    
            var event = document.createEvent("HTMLEvents");
            event.initEvent("click",true,false);
            document.getElementById("selectBtn").dispatchEvent(event);
        }
    });
});

document.getElementById('cngBtn').addEventListener('click', function(){
    document.getElementById('loading').style.display='block'; //로딩창만들기    
    if(this.style.color!='black'){
        this.innerHTML = '<i class="material-icons">library_music</i><br/>top1-50';
        this.style.color = 'black';
        page=2
    }
    else{
        this.innerHTML = '<i class="material-icons">library_music</i><br/>top51-100';
        this.style.color = '#ff3d00';
        page=1;
    }
    
    //목록선택 눌려있을때, 목록선택해제 이벤트 자동실행
    if(document.getElementById('selectBtn').style.color=='black'){
        var event = document.createEvent("HTMLEvents");
        event.initEvent("click",true,false);
        document.getElementById("selectBtn").dispatchEvent(event);
    }
    //=========ajax========
    var httpRequest;
    if(window.XMLHttpRequest) httpRequest = new XMLHttpRequest();
    else if(window.ActiveXObject) httpRequest = new ActiveXObject("Microsoft.XMLHTTP");
    console.log('page changed!!!');
    httpRequest.open('GET', 'http://'+serverIP+'/pages/'+page, true);
    //httpRequest.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    httpRequest.send('null');

    httpRequest.onreadystatechange = function(){
        if(httpRequest.readyState==4){
            if(httpRequest.status==200){ //이건 클라이언트꺼 서버것 아님
                var item = JSON.parse(httpRequest.responseText);
                console.log(item);  
                makeMid(page, item);
                if(page==2) createBanners(50,100);
                else createBanners(0,50);
            }
            else console.error('server has errors.');
        }
    }; 
    //=========ajax========
});

document.getElementById('shakeBtn').addEventListener('click', shakeList);

document.getElementById('selectBtn').addEventListener('click', selectMode);

document.getElementById('clearBtn').addEventListener('click', initTrack);

//-------------------- 제어함수
//top51-100 cngBtn html만들기
function makeMid(page, item){
    var cntr = "";
    var startNum = 0;
    if(page==2) startNum=50;
    //item.img.forEach(function(el, idx){
    for(var i=startNum; i<startNum+50; i++){
        var rank = i;
        cntr +=
            "<div class='cntr' id='cntr" +rank+ "' onclick='spreadDown(this)'>" +
            "\n<h4>"+(rank + 1)+"</h4>" +
            "<i class='material-icons' id='cntrBtn" +rank+ "' onclick='spreadUp(event)' style='display:none; width:30px; height:30px'>keyboard_arrow_up</i>" +
            "<h4>"+item.name[rank]+"</h4>" +
            "<h4>"+item.song[rank]+"</h4>" +
            "<i class='material-icons' id='mvIcon" +rank+ "'>expand_more</i>" +

            "<div class='check' id='check" +rank+ "' style='display:none; position:absolute' onclick='addCheck(event)'></div>" +
            "<div class='folder' id='folder" +rank+ "' style='height:0px'>" +
                "<div class='innerFolder' id='innerFolder" +rank+ "'>" +
                    "<div class ='firstFloor' id ='firstFloor" +rank+ "'>" +
                        "<div class='genie'>" +
                            "<img src=" +item.img[rank]+ " id='album"+rank+"' style='margin:auto'><br/>" +
                        "</div>" +
                        "<p class='lyrics' id='lyrics" +rank+ "'></p>" +
                    '</div>' +
                    "<div class='youtube' id='youtube" +rank+ "'>" +
                    "</div>" +
                    "<article class='news' id='news" +rank+ "'>" +
                        "<div class='newsBtn' id='newsBtn" +rank+ "' onclick='spreadNews(event)'>" +
                            "<i class='material-icons'>fiber_new</i>관련 뉴스 보기" +
                        "</div><br/>" +
                    "</article>" +
                "</div>" +
            "</div>" +
        "</div>" ;
    }
    cntr += "<div style='height:50px; clear:both'></div>";
    cntr += "<div id='cover' style='display:none'></div>";
    document.getElementsByClassName('mid')[0].innerHTML = cntr;
    document.getElementById('loading').style.display='none'; //로딩창 없애기
}
//audioObj안에 있는 목록들 재생src목록 만들어서 html로 변환
function makeList(audioObj){
    //var audioObj = {length:'', date:0, audioList:[{videoId:'', title:'', dur:0, id=0, cnt:0}]};
    //audioList를 받아왔을때만 푸시, 그냥 목록섞기엔 작동안함
    if(audioObj){
        for(var i=0; i<audioObj.length; i++){
            var title = audioObj.audioList[i].title;
            srcArr.push('audioSample/'+title);
        }
    }
    //console.log('srcArr: ',srcArr);
    trkList.innerHTML = '';
    srcArr.forEach(function(item){
        trkList.innerHTML += ('<li class="track">'+item.replace('audioSample/','')+'</li>');
        //트랙 아이디 만들기
        trkList.lastChild.setAttribute('id', 'track'+(trkList.childNodes.length-1));
        trkList.lastChild.setAttribute('onclick', 'selectTrack(event)');
    });
    totalDur();
}
//ajax로 '/audolist'에서 audioObj받아오기
function getAudioList(callback){
    var httpRequest;
    if(window.XMLHttpRequest) httpRequest = new XMLHttpRequest();
    else if(window.ActiveXObject) httpRequest = new ActiveXObject("Microsoft.XMLHTTP");

    httpRequest.open('GET', 'http://'+serverIP+'/audioList', true);
    //js파일 달라도 serverIP 호이스팅 가능
    //httpRequest.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    httpRequest.send('null');

    httpRequest.onreadystatechange = function(){
        if(httpRequest.readyState==4){
            if(httpRequest.status==200){ //이건 클라이언트꺼 서버것 아님
                //서버에서 객체 말고 배열로만 보내면 텍스트로만 인지해서 추후에 문제생김
                var audioObj = JSON.parse(httpRequest.responseText);

                console.log(audioObj);
                return callback(audioObj); //콜백함수에 audioObj파라메터로 실행
            }
            else console.error('can`t get audiolist.json...');
        }
    };
}
//개별목록 선택모드로 변경/복귀
function selectMode(){
    //내가 받은 노래파일과 조회수 저장하려면 post요청해서 audioList.json에 저장해야함
    var cstm = document.getElementsByClassName('check');
    var selectBtn = document.getElementById('selectBtn');
    if(cstm[0].style.display=='none'){
        selectBtn.style.color = 'black';
        selectBtn.innerHTML="<i class='material-icons'>queue_music</i></br>목록선택 해제";
        var hgt = document.getElementById('coPlayer').clientHeight+ document.getElementById('subMenu').clientHeight + 15; //5*3=15
        //console.log(hgt);
        document.getElementById('playerSec').style.height = hgt+'px';
        document.getElementById('curSong').style.display = "none";
        document.getElementById('subPlay').style.display = "block";
        setTimeout(function(){
            findPlayBtnPos();
            //딜레이 없이 바로 넣으면 트랜지션 안먹음 
            document.getElementById('subPlayBtn').style.color = '#ff3d00';
            document.getElementById('subPlayBtn').style.textShadow = '1px 1px 1px gray';
        },1010); //목록 늘어나는게 트랜지션 1000이므로 그것보다 나중에 실행하려고
        for(var i=0; i<cstm.length; i++){
            cstm[i].style.display='inline-block';
            cstm[i].style.color='#ff3d00';
            if(page==1) document.getElementById('mvIcon'+i).innerHTML = 'check';
            else document.getElementById('mvIcon'+(i+50)).innerHTML = 'check';
        }
    }
    else{
        selectBtn.style.color = '#ff3d00';
        selectBtn.innerHTML="<i class='material-icons'>queue_music</i></br>노래 목록";
        var hgt = document.getElementById('playerSec').clientHeight - document.getElementById('subMenu').clientHeight + document.getElementById('curSong').style.height.replace('px','')*1;
        document.getElementById('playerSec').style.height = hgt+'px';
        document.getElementById('curSong').style.display = "block";
        document.getElementById('subPlay').style.display = "none";
        setTimeout(function(){
            //딜레이 없이 바로 넣으면 트핸지션 안먹음
            document.getElementById('subPlayBtn').style.color = 'transparent';
            document.getElementById('subPlayBtn').style.textShadow = 'none';
        },1000);
        for(var i=0; i<cstm.length; i++){
            cstm[i].style.display='none';
            if(page==1) document.getElementById('mvIcon'+i).innerHTML = 'expand_more';
            else document.getElementById('mvIcon'+(i+50)).innerHTML = 'expand_more';
        }
    }
}
//노래별로 체크하면 cstmObj에 정보저장 
function addCheck(e){
    e.stopPropagation(); //버블링 취소
    //if(e.target.getAttribute('class') != 'check') return;
    
    var el = e.target;
    //el.innerHTML = '재생목록에 추가되었습니다';
    el.style.backgroundColor = '#673ab7';
    //youtube videoId 요청전에 바로바로 목록 html로 생성
    var name = el.previousElementSibling.previousElementSibling.innerHTML;
    var song = el.previousElementSibling.innerHTML;
    var audioPath = name+" "+song+'.mp3';
//    audioPath = audioPath.replace(/&amp;|\\|\/|:|\*|\?|"|<|>|\|/g, ""); //특수문자 제거
//    audioPath = "audioSample/"+audioPath;
//    console.log('audioPath: ', audioPath);
    
    var id = el.getAttribute('id').substring(5)*1;
    youtubeAjax(id, function(videoObj){
        cstmObj.length++;
        cstmObj.audioList.push({
            videoId: videoObj.videoId,
            title: videoObj.name+' '+videoObj.song+'.mp3',
            dur: videoObj.dur,
            id: videoObj.idx,
            cnt: videoObj.cnt
        });
        //console.log(cstmObj);
        
        var audioPath = videoObj.name+' '+videoObj.song;
        audioPath = audioPath.replace(/\\|\/|:|\*|\?|"|<|>|\|/g, "");
        audioPath = 'audioSample/'+ audioPath +'.mp3';
        srcArr.push(audioPath);
        trkList.innerHTML += ('<li class="track">'+audioPath.replace('audioSample/','')+'</li>');
        //트랙 아이디 만들기
        trkList.lastChild.setAttribute('id', 'track'+(trkList.childNodes.length-1));
        trkList.lastChild.setAttribute('onclick', 'selectTrack(event)');
        document.getElementById('trkList').scrollTop = 100000; //스크롤 맨 아래로
        totalDur();
    });
}
//목록섞기
function shakeList(){ // 재생목록 섞기
    var randArr = makeSeq(0, srcArr.length);
    var temp = new Array(srcArr.length);
    randArr.forEach(function(item, idx){
        temp[idx] = srcArr[item];
    });
    srcArr = temp;
    makeList();
    //console.log(srcArr);
}
//min에서 max-1값까지를 갖는 랜덤배열 생성
function makeSeq(min, max){ 
    var itv = max-min
    var arr=[];
    for(var i=0; i<itv+1; i++){
        pushNum = Math.floor(Math.random()*itv)+min;
        for(var j=0; j<i; j++){
            if(pushNum==arr[j]){
                i--;
                break;
            }
            if(j===i-1) arr.push(pushNum);
        }
    }
    return arr;
}
//재생목록 이름 직접 클릭해서 재생해주는 함수
function selectTrack(e){
    var el = e.target;
    var idx = el.getAttribute('id').substring(5)*1; 
    //console.log(idx);

    trkNum=idx;
    player.src=srcArr[trkNum];
    player.play();
}
//재생목록, trkNum초기화
function initTrack(){
    trkNum=-1;
    trkList.innerHTML='';
    srcArr=[];
    cstmObj={length:0, date:0, audioList:[]};
    document.getElementById('totDur').innerHTML='';
}
//서버에 post, '/getMp3'로 mp3파일 다운요청
function setAudioFile(videoObj, callback){
    var title = videoObj.name+' '+videoObj.song;
    var query = 'videoId='+videoObj.videoId+'&idx='+videoObj.idx+'&title='+videoObj.title+'&dur='+videoObj.dur;
    console.log(query);
    var httpRequest;
    if(window.XMLHttpRequest) httpRequest = new XMLHttpRequest();
    else if(window.ActiveXObject) httpRequest = new ActiveXObject("Microsoft.XMLHTTP");

    httpRequest.open('POST', 'http://'+serverIP+'/getMp3', true);
    //js파일 달라도 serverIP 호이스팅 가능
    httpRequest.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    httpRequest.send(query);

    httpRequest.onreadystatechange = function(){
        if(httpRequest.readyState==4){
            if(httpRequest.status==200){ //이건 클라이언트꺼 서버것 아님
                var stat = httpRequest.responseText; //stat='200'이면 정상다운로드
                return callback(stat); //콜백함수
            }
            else console.error('can`t get mp3 file...');
        }
    };
};
//총 재생시간 표시, makeList후와 addCheck마지막에 사용
function totalDur(){
    var totDur = 0;
    for(var i=0; i<srcArr.length; i++){
        //shake시 id와 트랙순서 다른거 보정필요 
        var track = srcArr[i].replace('/mp3','');
        track = track.replace('audioSample/', '');
        var txId = -1; 
        cstmObj.audioList.forEach(function(item, i){
            if(item.title == track) txId=i;
        });
        totDur += cstmObj.audioList[txId].dur;
    }
    if(totDur.isNaN){
        document.getElementById('totDur').innerHTML = '계산 불가';
        return 0;
    }
    
    var min = (totDur/60)>>0;
    var sec = totDur%60;
    document.getElementById('totDur').innerHTML = min+'분 '+sec+'초';
    return totDur;
}

window.addEventListener('scroll', scrollAndFix);
function scrollAndFix(){
    var title = document.getElementById('title');
    var player = document.getElementById('playerSec');
    if(window.scrollY>=title.clientHeight){
        player.style.position = 'fixed';
        player.style.width = '100%';
        player.style.top = 0;
        //데스크톱 브라우저 스크롤바 16px보정 
        if(window.innerWidth > document.body.scrollWidth + 16) player.style.left = (window.innerWidth - player.clientWidth -16)/2 + 'px';
        else player.style.left = (window.innerWidth - player.clientWidth)/2 + 'px';
        //console.log(player.style.left);
//        console.log('apple',player.style.paddingLeft.replace('em','')*16);
        player.style.padding = '5px 16px 0 16px';
    }
    else if(player.style.position == 'fixed'){
        player.style.position = 'initial';
        player.style.padding = '5px 0 0 0';
    }
    findPlayBtnPos();
}
//subPlayBtn 위치찾기, loading위치찾기
function findPlayBtnPos(){
    var title = document.getElementById('title');
    var player = document.getElementById('playerSec');
    var subPlay = document.getElementById('subPlay');
    var loading = document.getElementById('loading');
    if(window.scrollY>=title.clientHeight){
        subPlay.style.top = player.clientHeight - 60/2 + 'px';
        loading.style.top = player.clientHeight - 80/2 + 'px';
    }
    else{
        subPlay.style.top = title.clientHeight - window.scrollY + player.clientHeight - 60/2 + 'px';
        loading.style.top = title.clientHeight - window.scrollY + player.clientHeight - 80/2 + 'px';
    }
}
//플레이어 에러 3회시 deletenull ajax call
function deletenullAjax(errTitle, callback){
    var httpRequest;
    if(window.XMLHttpRequest) httpRequest = new XMLHttpRequest();
    else if(window.ActiveXObject) httpRequest = new ActiveXObject("Microsoft.XMLHTTP");
    
    var query = 'errTitle='+errTitle;
    httpRequest.open('POST', 'http://'+serverIP+'/deletenull', true);
    httpRequest.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    httpRequest.send(query);

    httpRequest.onreadystatechange = function(){
        if(httpRequest.readyState==4){
            if(httpRequest.status==200){ //이건 클라이언트꺼 서버것 아님
                var res = httpRequest.responseText;
                console.log(res); //makeCustomList()에 사용
                return callback();  
            }
            else console.error('server has errors.');
        }
    };
}
//모바일 백그라운드 깨움용 신호 보내기
function sendSignalAjax(){
    var httpRequest;
    if(window.XMLHttpRequest) httpRequest = new XMLHttpRequest();
    else if(window.ActiveXObject) httpRequest = new ActiveXObject("Microsoft.XMLHTTP");
    httpRequest.open('GET', 'http://'+serverIP+'/stillhere', true);
    //httpRequest.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    httpRequest.send('null');

    httpRequest.onreadystatechange = function(){
        if(httpRequest.readyState==4){
            if(httpRequest.status==200){ //이건 클라이언트꺼 서버것 아님
                var res = httpRequest.responseText;
                console.log('I`m still connecting',res);
                return;  
            }
            else console.error('server has errors.');
        }
    };
}
