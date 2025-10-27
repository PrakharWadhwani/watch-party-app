import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Volume1, Maximize, Minimize,
  ChevronLeft, ChevronRight, Clock, X,
} from 'lucide-react';
import './VideoPlayer.css';

// Helper function to format time
const formatTime = (timeInSeconds) => {
  const time = Math.floor(timeInSeconds);
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = time % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const VideoPlayer = ({ src }) => {
  // --- State ---
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [wasPausedBeforeScrub, setWasPausedBeforeScrub] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [areControlsVisible, setAreControlsVisible] = useState(true);
  const [skipIndicator, setSkipIndicator] = useState({ direction: null, amount: 0 });
  const [skipIndicatorKey, setSkipIndicatorKey] = useState(0);
  const [isVolumeAreaHovered, setIsVolumeAreaHovered] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  const [previousVolume, setPreviousVolume] = useState(1);
  const [centerAnimation, setCenterAnimation] = useState(null); 
  const [centerAnimationKey, setCenterAnimationKey] = useState(0);
  const [centerVolumePercent, setCenterVolumePercent] = useState(null); 

  // --- Refs ---
  const videoRef = useRef(null);
  const playerContainerRef = useRef(null);
  const timelineContainerRef = useRef(null);
  const hideControlsTimer = useRef(null);
  const skipIndicatorTimer = useRef(null);
  const speedMenuRef = useRef(null);
  const centerAnimationTimer = useRef(null);

  // --- THIS IS THE "PLAYER NOT UPDATING" FIX ---
  useEffect(() => {
    if (videoRef.current) {
      if (src) {
        // A new video URL has been passed in
        console.log('[VideoPlayer.jsx] src prop changed. Forcing load:', src);
        videoRef.current.src = src; // Manually set the DOM element's src
        videoRef.current.load();     // Tell the element to load the new media
        
        // Reset state
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
      } else {
        // The src prop is null (e.g., on initial load)
        console.log('[VideoPlayer.jsx] src prop is null. Unloading video.');
        videoRef.current.removeAttribute('src'); // Remove src
        videoRef.current.load();               // Force reload (will be empty)
      }
    }
  }, [src]); // This effect runs *only* when the 'src' prop changes
  // --- END OF FIX ---

  // --- Animation Trigger Helper ---
  const triggerCenterAnimation = useCallback((type) => {
    if (centerAnimationTimer.current) clearTimeout(centerAnimationTimer.current);
    setCenterAnimation(type);
    setCenterAnimationKey(prev => prev + 1);
    centerAnimationTimer.current = setTimeout(() => {
        setCenterAnimation(null);
        if (type === 'volumePercent') { 
            setCenterVolumePercent(null);
        }
    }, 600);
  }, []);

  // --- Play/Pause ---
  const togglePlayPause = useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) playPromise.then(() => triggerCenterAnimation('play')).catch(err => { if (err.name !== 'AbortError') console.error('Play error:', err); });
      } else {
        videoRef.current.pause();
        triggerCenterAnimation('pause');
      }
    }
  }, [triggerCenterAnimation]);

  // --- Volume & Mute ---
  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      const currentMuted = videoRef.current.muted;
      const newMutedState = !currentMuted;
      setIsMuted(newMutedState);
      if (newMutedState) { 
        const currentVolume = videoRef.current.volume;
        if (currentVolume > 0) setPreviousVolume(currentVolume);
        videoRef.current.volume = 0; videoRef.current.muted = true; setVolume(0);
      } else { 
        const volumeToRestore = previousVolume > 0 ? previousVolume : 1;
        videoRef.current.volume = volumeToRestore; videoRef.current.muted = false; setVolume(volumeToRestore);
      }
      setCenterVolumePercent(null); 
      triggerCenterAnimation('volume'); 
    }
  }, [previousVolume, triggerCenterAnimation]);

  const handleVolumeChange = (e) => {
    if (videoRef.current) {
      const newVolume = parseFloat(e.target.value);
      videoRef.current.volume = newVolume; const newMutedState = newVolume === 0;
      videoRef.current.muted = newMutedState; setVolume(newVolume); setIsMuted(newMutedState);
      if (newVolume > 0) setPreviousVolume(newVolume);
    }
  };

  const adjustVolume = useCallback(
    (amount) => {
      if (videoRef.current) {
        const currentVolume = videoRef.current.volume;
        const newVolume = Math.max(0, Math.min(1, currentVolume + amount));
        videoRef.current.volume = newVolume;
        const newMutedState = newVolume === 0;
        videoRef.current.muted = newMutedState;
        setVolume(newVolume);
        setIsMuted(newMutedState);
        if (newVolume > 0) setPreviousVolume(newVolume);
        setCenterVolumePercent(Math.round(newVolume * 100)); 
        triggerCenterAnimation("volume"); 
      }
    },
    [triggerCenterAnimation]
  );

  // --- Timeline & Seeking ---
  const handleTimeUpdate = () => { if (videoRef.current && !isScrubbing) setCurrentTime(videoRef.current.currentTime); };
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration); videoRef.current.playbackRate = playbackRate;
      const initialVol = videoRef.current.volume; setVolume(initialVol);
      if (initialVol > 0) setPreviousVolume(initialVol); setIsMuted(videoRef.current.muted);
    }
  };
  const seek = useCallback((amount) => {
      if (videoRef.current) {
        const oldTime = videoRef.current.currentTime; const newTime = Math.max(0, Math.min(duration, oldTime + amount));
        const actualAmountSkipped = newTime - oldTime; if (actualAmountSkipped === 0) return;
        videoRef.current.currentTime = newTime; setCurrentTime(newTime);
        if (skipIndicatorTimer.current) clearTimeout(skipIndicatorTimer.current);
        const newDirection = amount > 0 ? 'forward' : 'backward'; const amountToAdd = Math.abs(amount);
        let accumulatedAmount = amountToAdd; if (skipIndicator.direction === newDirection) accumulatedAmount = skipIndicator.amount + amountToAdd;
        setSkipIndicator({ direction: newDirection, amount: accumulatedAmount }); setSkipIndicatorKey(prev => prev + 1);
        skipIndicatorTimer.current = setTimeout(() => setSkipIndicator({ direction: null, amount: 0 }), 800);
      }
    }, [duration, skipIndicator]);

  // --- Fullscreen ---
  const toggleFullscreen = useCallback(() => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) playerContainerRef.current.requestFullscreen().catch(err => console.error(`FS error: ${err.message} (${err.name})`));
    else document.exitFullscreen();
  }, []);
  useEffect(() => {
    const hFS = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', hFS);
    return () => document.removeEventListener('fullscreenchange', hFS);
  }, []);

  // --- Playback Speed ---
  const selectPlaybackSpeed = useCallback((speed) => { setPlaybackRate(speed); setIsSpeedMenuOpen(false); }, []);
  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = playbackRate; }, [playbackRate]);
  useEffect(() => {
    const clickOutside = (e) => { if (speedMenuRef.current && !speedMenuRef.current.contains(e.target) && !e.target.closest('.vp-speed-button-container')) setIsSpeedMenuOpen(false); };
    if (isSpeedMenuOpen) document.addEventListener('mousedown', clickOutside); else document.removeEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, [isSpeedMenuOpen]);

  // --- Control Visibility ---
  const showControls = useCallback(() => { if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current); setAreControlsVisible(true); }, []);
  const hideControls = useCallback(() => { if (videoRef.current && !videoRef.current.paused) { setAreControlsVisible(false); setIsVolumeAreaHovered(false); setIsSpeedMenuOpen(false); } }, []);
  const scheduleHideControls = useCallback(() => { if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current); hideControlsTimer.current = setTimeout(hideControls, 3000); }, [hideControls]);
  useEffect(() => { if (isPlaying) scheduleHideControls(); else showControls(); return () => clearTimeout(hideControlsTimer.current); }, [isPlaying, showControls, scheduleHideControls]);
  const handleMouseMove = () => { showControls(); scheduleHideControls(); };
  const handleMouseLeave = () => { if (isPlaying) hideControls(); };

  // --- Timeline Scrubbing ---
  const handleTimelineSeek = useCallback((e) => {
    if (!timelineContainerRef.current || !videoRef.current || !duration) return;
    const rect = timelineContainerRef.current.getBoundingClientRect();
    let p = (e.clientX - rect.left) / rect.width;
    p = Math.max(0, Math.min(1, p));
    const newTime = p * duration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  },[duration]);

  const handleTimelineMouseDown = (e) => {
    setIsScrubbing(true); setWasPausedBeforeScrub(videoRef.current.paused);
    if (!videoRef.current.paused) videoRef.current.pause();
    handleTimelineSeek(e);
  };
  useEffect(() => {
    const handleMM = (e) => { if (!isScrubbing) return; e.preventDefault(); handleTimelineSeek(e); };
    const handleMU = () => { if (isScrubbing) { setIsScrubbing(false); if (!wasPausedBeforeScrub) { const pP = videoRef.current.play(); if (pP !== undefined) pP.catch(err => { if (err.name !== 'AbortError') console.error('Play error:', err); }); } } };
    window.addEventListener('mousemove', handleMM); window.addEventListener('mouseup', handleMU);
    return () => { window.removeEventListener('mousemove', handleMM); window.removeEventListener('mouseup', handleMU); };
  }, [isScrubbing, wasPausedBeforeScrub, duration, handleTimelineSeek]);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const num = parseFloat(e.key);
      if (!isNaN(num) && num >= 0 && num <= 9) { e.preventDefault(); if (videoRef.current && duration > 0) { const newT = duration * (num / 10); videoRef.current.currentTime = newT; setCurrentTime(newT); } return; }
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlayPause(); break;
        case 'm': e.preventDefault(); toggleMute(); break;
        case 'f': e.preventDefault(); toggleFullscreen(); break;
        case 'ArrowLeft': case 'j': e.preventDefault(); seek(-10); break;
        case 'ArrowRight': case 'l': e.preventDefault(); seek(10); break;
        case 'ArrowUp': e.preventDefault(); adjustVolume(0.1); break;
        case 'ArrowDown': e.preventDefault(); adjustVolume(-0.1); break;
        case 'Escape': if (isFullscreen) { e.preventDefault(); toggleFullscreen(); } if (isSpeedMenuOpen) { e.preventDefault(); setIsSpeedMenuOpen(false); } break;
        default: break;
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause, toggleMute, toggleFullscreen, seek, adjustVolume, isFullscreen, isSpeedMenuOpen, duration]);


  // --- Render Volume Icon ---
  const renderVolumeIcon = () => { if (isMuted || volume === 0) return <VolumeX size={50} />; if (volume < 0.5) return <Volume1 size={50} />; return <Volume2 size={50} />; };

  // --- Render ---
  return (
    <div ref={playerContainerRef} className={`vp-player-container ${!areControlsVisible ? 'vp-hide-cursor' : ''}`} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      <video 
        ref={videoRef} 
        src={src} // 'src' is still here for the initial load
        className="vp-video-element" 
        onClick={togglePlayPause} 
        onTimeUpdate={handleTimeUpdate} 
        onLoadedMetadata={handleLoadedMetadata} 
        onPlay={() => setIsPlaying(true)} 
        onPause={() => setIsPlaying(false)} 
        onEnded={() => setIsPlaying(false)} 
        muted={isMuted}
        // playbackRate prop removed
      >
        {/* Captions removed */}
      </video>

      {centerAnimation && (
        <div className="vp-center-animation" key={centerAnimationKey}>
          {centerAnimation === 'play' && <Play size={50} />}
          {centerAnimation === 'pause' && <Pause size={50} />}
          {centerAnimation === 'volume' && (
            <div className="vp-center-volume-wrapper">
              {centerVolumePercent !== null && ( 
                <span className="vp-center-volume-text">{centerVolumePercent}%</span>
              )}
              {renderVolumeIcon()}
            </div>
          )}
        </div>
      )}

      {skipIndicator.direction && (<div key={skipIndicatorKey} className={`vp-skip-indicator vp-skip-indicator-${skipIndicator.direction}`}><span>{skipIndicator.direction === 'backward' ? '-' : '+'}{skipIndicator.amount}</span><div className="vp-skip-arrow-container">{skipIndicator.direction === 'backward' ? (<><ChevronLeft size={32} strokeWidth={2.5} className="vp-skip-arrow vp-skip-arrow-fixed" /><ChevronLeft size={32} strokeWidth={2.5} className="vp-skip-arrow vp-skip-arrow-moving" /></>) : (<><ChevronRight size={32} strokeWidth={2.5} className="vp-skip-arrow vp-skip-arrow-fixed" /><ChevronRight size={32} strokeWidth={2.5} className="vp-skip-arrow vp-skip-arrow-moving" /></>)}</div></div>)}

      {/* Download UI Removed */}

      <div className={`vp-controls-overlay ${areControlsVisible ? 'vp-visible' : ''}`}>
        <div className="vp-timeline-container" ref={timelineContainerRef} onMouseDown={handleTimelineMouseDown}>
          <div className="vp-timeline-track"><div className="vp-timeline-progress" style={{ width: `${(currentTime / duration)*100}%` }}></div><div className="vp-timeline-scrubber" style={{ left: `${(currentTime / duration) * 100}%` }}></div></div>
        </div>
        <div className="vp-controls-bar">
          <div className="vp-controls-left">
             <button className="vp-control-button" onClick={togglePlayPause}>{isPlaying ? <Pause size={20} /> : <Play size={20} />}<span className="vp-tooltip">{isPlaying ? 'Pause' : 'Play'}</span></button>
             <div className="vp-volume-container" onMouseEnter={() => setIsVolumeAreaHovered(true)} onMouseLeave={() => setIsVolumeAreaHovered(false)}>
               <button className="vp-control-button" onClick={toggleMute}>{isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}<span className="vp-tooltip">{isMuted ? 'Unmute (M)' : 'Mute (M)'}</span></button>
               {isVolumeAreaHovered && (<input type="range" min="0" max="1" step="0.01" value={volume} onChange={handleVolumeChange} className="vp-volume-slider" style={{ '--vp-volume-percent': `${volume * 100}%` }}/>)}
             </div>
             <div className="vp-timestamp">{formatTime(currentTime)} / {formatTime(duration)}</div>
          </div>
          <div className="vp-controls-right">
             <div className="vp-speed-button-container">
               <button className="vp-control-button vp-speed-button" onClick={() => setIsSpeedMenuOpen(prev => !prev)} title="Playback Speed"><Clock size={20} /><span className="vp-tooltip">{playbackRate}x</span></button>
               {isSpeedMenuOpen && (<div className="vp-speed-menu" ref={speedMenuRef}>{PLAYBACK_SPEEDS.map(speed => (<button key={speed} className={`vp-speed-option ${playbackRate === speed ? 'vp-active' : ''}`} onClick={() => selectPlaybackSpeed(speed)}>{speed === 1 ? 'Normal' : `${speed}x`}</button>))}</div>)}
             </div>
             {/* Download and CC buttons removed */}
             <button className="vp-control-button" onClick={toggleFullscreen}>{isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;