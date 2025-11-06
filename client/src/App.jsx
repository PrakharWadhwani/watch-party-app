import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

// --- Player Imports ---
import VideoPlayer from './VideoPlayer.jsx';        // Your custom player for files
import ReactPlayer from 'react-player';         // The player for YouTube/etc

// --- CSS Imports ---
import './App.css'; 
import './PlayerWrapper.css'; // Your new CSS file

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
console.log("Using SERVER_URL:", SERVER_URL);

const socket = io(SERVER_URL, {
  transports: ['polling'] // Force it to NOT use WebSockets
});

function App() {
  const [room, setRoom] = useState('');
  const [joined, setJoined] = useState(false);
  const [videoSrc, setVideoSrc] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const [playing, setPlaying] = useState(false); // This will be used for ReactPlayer
  const [hostId, setHostId] = useState(null);
  const [myId, setMyId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  // isHost will be calculated right before rendering

  useEffect(() => {
    socket.on('connect', () => {
      const connectedId = socket.id; 
      setMyId(connectedId);
      console.log('Connect Event: Set myId to:', connectedId); 
    });

    socket.on('video-set', (src) => {
      console.log('Video set to:', src);
      setVideoSrc(src);
      setPlaying(true); // Tell ReactPlayer to auto-play
    });

    socket.on('room-state', (state) => {
      console.log('Raw received room state:', state); 
      setVideoSrc(state.videoSrc);
      setPlaying(state.playing);
      setHostId(state.host);
      console.log('Room State Event: Set hostId to:', state.host); 
    });

    socket.on('new-host', (id) => {
      console.log('New host event received:', id); 
      setHostId(id);
      console.log('New Host Event: Set hostId to:', id); 
    });

    socket.on('chat-message', (msg) => {
      setMessages((prevMessages) => [...prevMessages, msg]);
    });
    
    // --- NOTE: Play/Pause/Seek events are not yet handled ---
    // This is the next step for full sync
    // socket.on('played', () => setPlaying(true));
    // socket.on('paused', () => setPlaying(false));
    // etc.

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleJoin = () => {
    if (room) {
      socket.emit('join', room);
      setJoined(true);
    }
  };

  const handleBecomeHost = () => {
    socket.emit('become-host');
  };

  const handleSetVideoUrl = () => {
    const currentIsHost = myId === hostId;
    if (!currentIsHost) return;
    console.log('Step 3: Emitting "set-video" to server');
    socket.emit('set-video', videoUrl);
  };

  const handleSetVideoFile = async () => {
    const currentIsHost = myId === hostId;
    if (!currentIsHost || !videoFile) return;

    console.log('Step 1: Upload button clicked. Starting upload...');
    const formData = new FormData();
    formData.append('video', videoFile);

    try {
      const res = await axios.post(`${SERVER_URL}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      console.log('Step 2: Upload successful. Server responded:', res.data);

      if (res.data && res.data.videoPath) {
        const fullVideoPath = `${SERVER_URL}${res.data.videoPath}`;
        console.log('Step 3: Emitting "set-video" to server');
        socket.emit('set-video', fullVideoPath);
      } else {
        console.error('CRITICAL ERROR: "videoPath" was not in server response.');
      }
    } catch (err) {
      console.error('CRITICAL ERROR: An error occurred during the set-video process.', err);
    }
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (chatInput.trim()) {
      socket.emit('chat-message', chatInput);
      setChatInput('');
    }
  };

  // --- Calculate isHost and check video type ---
  console.log('Render Check - Values:', { myId, hostId }); 
  const isHost = myId != null && hostId != null && myId === hostId;
  console.log('Render Check - Result:', { isHost });
  
  // --- NEW LOGIC: Check if the source is a YouTube link ---
  // This checks if the videoSrc is not null AND includes youtube.com or youtu.be
  const isPlatformVideo = videoSrc && (
    videoSrc.includes('youtube.com') || 
    videoSrc.includes('youtu.be')
    // You could add || videoSrc.includes('twitch.tv') here later
  );
  // ---

  if (!joined) {
    return (
      <div className="room-controls">
        <h2>Join a Watch Party</h2>
        <input
          type="text"
          placeholder="Enter room name"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
        />
        <button onClick={handleJoin}>Join Room</button>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="main-content">
        <div className="status-bar">
          <p>Room: <strong>{room}</strong> | My ID: {myId} | Host ID: {hostId}
            {isHost && <strong> (You are the host)</strong>}
          </p>
        </div>

        {/* --- NEW CONDITIONAL RENDERING --- */}
        <div className="player-wrapper">
          {isPlatformVideo ? (
            <ReactPlayer
              className="react-player" // This class is targeted by PlayerWrapper.css
              url={videoSrc}
              width="100%"
              height="100%"
              controls={true} // Use the built-in YouTube controls
              playing={playing} // Pass the playing state
              // --- TODO: Add event handlers to EMIT sync events ---
              // These are needed for full sync, but not for just playing
              // onPlay={() => isHost && socket.emit('play')}
              // onPause={() => isHost && socket.emit('pause')}
              // onSeek={(seconds) => isHost && socket.emit('seek', seconds)}
            />
          ) : (
            <VideoPlayer // Your custom player
              src={videoSrc}
            />
          )}
        </div>
        {/* --- END OF NEW LOGIC --- */}


        <div className="video-controls">
          <h3>Video Controls</h3>
          <div className="video-controls-grid">
            <div>
              <label>Set Video from URL:</label>
              <input
                type="text"
                placeholder="YouTube link or direct file URL"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)} // <-- TYPO FIX
                disabled={!isHost} 
              />
              <button onClick={handleSetVideoUrl} disabled={!isHost}>
                Set URL
              </button>
            </div>
            <div>
              <label>Set Video from File:</label>
              <input
                type="file"
                accept="video/*"
                onChange={(e) => setVideoFile(e.target.files[0])}
                disabled={!isHost} 
              />
              <button onClick={handleSetVideoFile} disabled={!isHost || !videoFile}>
                Upload & Set
              </button>
            </div>
          </div>
          <button onClick={handleBecomeHost} disabled={!isHost}>
            Become Host
          </button>
        </div>
      </div>

      <div className="sidebar">
         <h3>Chat</h3>
        <div className="chat-box">
          <div className="messages">
            {messages.map((msg, index) => (
              <div key={index} className="message">
                <span className="sender">User {msg.id.substring(0, 5)}:</span>
                <p>{msg.message}</p>
              </div>
            ))}
          </div>
          <form className="chat-input" onSubmit={handleSendChat}>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type a message..."
            />
            <button type="submit">Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;