const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const videoFile = document.getElementById('videoFile');
const videoPlayer = document.getElementById('videoPlayer');
const hostControls = document.getElementById('hostControls');

let socket, peerConn;
let isHost = false;

joinBtn.onclick = () => {
  const room = roomInput.value.trim();
  if (room.length !== 4) {
    alert('Enter valid 4-digit room ID');
    return;
  }

  socket = new WebSocket(`ws://${location.host}`);
  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'join', room }));
    joinBtn.textContent = 'Connected';
    joinBtn.disabled = true;
  };

  socket.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'user-joined') {
      isHost = true;
      hostControls.classList.remove('d-none');
      setupPeer(true);
    }

    if (data.type === 'signal') {
      await peerConn.setRemoteDescription(data.signal);
      if (data.signal.type === 'offer') {
        const answer = await peerConn.createAnswer();
        await peerConn.setLocalDescription(answer);
        socket.send(JSON.stringify({ type: 'signal', signal: answer }));
      }
    }

    if (data.type === 'control') {
      if (!isHost) {
        if (data.action === 'play') videoPlayer.play();
        else if (data.action === 'pause') videoPlayer.pause();
        else if (data.action === 'seek') videoPlayer.currentTime = data.time;
      }
    }
  };

  videoFile.onchange = () => {
    const file = videoFile.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    videoPlayer.src = url;

    videoPlayer.onplay = () => {
      sendControl('play');
    };
    videoPlayer.onpause = () => {
      sendControl('pause');
    };
    videoPlayer.ontimeupdate = () => {
      if (!videoPlayer.seeking && isHost) {
        sendControl('seek', videoPlayer.currentTime);
      }
    };
  };
};

function sendControl(action, time = 0) {
  socket.send(JSON.stringify({ type: 'control', action, time }));
}

function setupPeer(initiator) {
  peerConn = new RTCPeerConnection();

  peerConn.ondatachannel = (e) => {
    const receiveChannel = e.channel;
    receiveChannel.onmessage = (e) => {
      const blob = new Blob([e.data]);
      const url = URL.createObjectURL(blob);
      videoPlayer.src = url;
    };
  };

  if (initiator) {
    const channel = peerConn.createDataChannel('video');
    channel.onopen = () => {
      videoFile.onchange = () => {
        const file = videoFile.files[0];
        const chunkSize = 16 * 1024;
        let offset = 0;

        const reader = new FileReader();
        reader.onload = (e) => {
          const data = e.target.result;
          channel.send(data);
          offset += data.byteLength;
          if (offset < file.size) readSlice(offset);
        };

        function readSlice(o) {
          const slice = file.slice(offset, o + chunkSize);
          reader.readAsArrayBuffer(slice);
        }

        readSlice(0);
      };
    };
  }

  peerConn.onicecandidate = (e) => {
    if (e.candidate) return;
    socket.send(JSON.stringify({ type: 'signal', signal: peerConn.localDescription }));
  };

  if (initiator) {
    peerConn.createOffer().then(desc => {
      peerConn.setLocalDescription(desc);
    });
  }
}