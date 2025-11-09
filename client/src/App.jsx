import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import VideoPlayer from './VideoPlayer.jsx'; // Using your player
import axios from 'axios';
import './App.css'; // Your original App.css

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
console.log("Using SERVER_URL:", SERVER_URL);

// --- THIS IS THE CONNECTION FIX ---
const socket = io(SERVER_URL, {
  transports: ['polling'] // Force it to NOT use WebSockets
});
// --- END OF FIX ---

function App() {
  const [room, setRoom] = useState('');
  const [joined, setJoined] = useState(false);
  const [videoSrc, setVideoSrc] = useState(null); 
  const [videoUrl, setVideoUrl] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const [playing, setPlaying] = useState(false); // Master "playing" state
  const [hostId, setHostId] = useState(null);
  const [myId, setMyId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  const playerRef = useRef(null); // Ref to call VideoPlayer's methods
  const ignoreEventsRef = useRef(false); // To prevent event loops

  const isHost = myId != null && hostId != null && myId === hostId;

  useEffect(() => {
    socket.on('connect', () => {
      const connectedId = socket.id; // Store in a variable first
      setMyId(connectedId);
      console.log('Connect Event: Set myId to:', connectedId); // <-- MODIFIED LOG
    });

    socket.on('video-set', (src) => {
      console.log('Video set to:', src);
      setVideoSrc(src);
      setPlaying(false); // Pause when a new video is set
    });

    socket.on('room-state', (state) => {
      console.log('Raw received room state:', state); // <-- ADDED LOG
      setVideoSrc(state.videoSrc);
      setPlaying(state.playing);
      setHostId(state.host);
      console.log('Room State Event: Set hostId to:', state.host); // <-- ADDED LOG
      
      // When joining, seek to the correct time
      // Use a timeout to give the player time to load
      setTimeout(() => {
        handleSeekFromSocket(state.currentTime);
      }, 1000); // 1 second delay
    });

    socket.on('new-host', (id) => {
      console.log('New host event received:', id); // <-- ADDED LOG
      setHostId(id);
      console.log('New Host Event: Set hostId to:', id); // <-- ADDED LOG
    });
    
    // --- These listeners now control the playing state ---
    socket.on('played', (currentTime) => {
      console.log('Received PLAY event');
      setPlaying(true);
      handleSeekFromSocket(currentTime); // Also sync time on play
    });

    socket.on('paused', (currentTime) => {
      console.log('Received PAUSE event');
      setPlaying(false);
      handleSeekFromSocket(currentTime); // Also sync time on pause
    });
    
    socket.on('seeked', (time) => {
      console.log(`Received SEEK event to: ${time}`);
      handleSeekFromSocket(time);
    });
    // ---

    socket.on('chat-message', (msg) => {
      setMessages((prevMessages) => [...prevMessages, msg]);
    });

    return () => {
      socket.disconnect();
    };
  }, []); // Empty dependency array, runs once

  // --- Universal seek function called by socket events ---
  const handleSeekFromSocket = (time) => {
    if (ignoreEventsRef.current) return; // Don't seek if we just sent it
    if (!playerRef.current) return;
    
    ignoreEventsRef.current = true;
    playerRef.current.seekTo(time);
    
    // Set a timer to re-enable emit events
    setTimeout(() => {
      ignoreEventsRef.current = false;
    }, 1000); // 1 second grace period
  };
  
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
    if (!isHost) return;
    console.log('Step 3: Emitting "set-video" to server');
    socket.emit('set-video', videoUrl);
  };

  const handleSetVideoFile = async () => {
    if (!isHost || !videoFile) return;

    console.log('Step 1: Upload button clicked. Starting upload...');
    const formData = new FormData();
    formData.append('video', videoFile);

    try {
      const res = await axios.post(`${SERVER_URL}/upload`, formData, { // Fixed template literal
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      console.log('Step 2: Upload successful. Server responded:', res.data);

      if (res.data && res.data.videoPath) {
        const fullVideoPath = `${SERVER_URL}${res.data.videoPath}`; // Fixed template literal

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

  // --- New Handlers for the Controlled Player ---
  const handlePlay = () => {
    // This check is now CRITICAL, as non-hosts can click the button
    if (!isHost || ignoreEventsRef.current || playing) return;
    console.log('Host clicked PLAY');
    setPlaying(true); // Update local state immediately
    
    const currentTime = playerRef.current ? playerRef.current.getCurrentTime() : 0;
    socket.emit('play', currentTime);
  };
  
  const handlePause = () => {
    // This check is now CRITICAL, as non-hosts can click the button
    if (!isHost || ignoreEventsRef.current || !playing) return;
    console.log('Host clicked PAUSE');
    setPlaying(false); // Update local state immediately

    const currentTime = playerRef.current ? playerRef.current.getCurrentTime() : 0;
    socket.emit('pause', currentTime);
  };
  
  const handleSeek = (time) => {
    if (!isHost || ignoreEventsRef.current) return;
    console.log(`Host SEEKED to ${time}`);
    // We update our own player locally inside VideoPlayer.jsx
    // We just need to tell the server
    socket.emit('seek', time);
  };
  // ---

  // --- Calculate isHost right before rendering ---
  console.log('Render Check - Values:', { myId, hostId }); // <-- ADDED LOG
  // const isHost = myId != null && hostId != null && myId === hostId; // Check for nulls too
  console.log('Render Check - Result:', { isHost }); // <-- ADDED LOG
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

        <div className="player-wrapper">
           <VideoPlayer
            ref={playerRef} // Give the ref
            src={videoSrc}
            // Pass down the new props
            isHost={isHost}
            playing={playing}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeek={handleSeek}
           />
        </div>

        <div className="video-controls">
          <h3>Video Controls</h3>
          <div className="video-controls-grid">
            <div>
              <label>Set Video from URL:</label>
              <input
                type="text"
                placeholder="https://example.com/video.mp4"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                disabled={!isHost} // Uses the isHost calculated just before render
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
                // --- THIS IS THE TYPO FIX ---
                onChange={(e) => setVideoFile(e.target.files[0])}
                // --- END OF FIX ---
                disabled={!isHost} // Uses the isHost calculated just before render
              />
              <button onClick={handleSetVideoFile} disabled={!isHost || !videoFile}>
                Upload & Set
              </button>
            </div>
          </div>
          <button 
            onClick={handleBecomeHost} 
            disabled={isHost} // <-- MODIFICATION: Changed from '!isHost' to 'isHost'
          >
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