/* ============================================================
   FAMILY AUDIO PLAYER — app.js
   Linear player: audio-0001.mp3 through audio-1189.mp3
   Mobile autoplay handled via user-interaction gate.
   Persists: current index + theme in localStorage.
   ============================================================ */

/* ── Constants ── */
const TOTAL_RECORDINGS    = 1189;
const AUDIO_FOLDER        = './audio/';
const AUDIO_PREFIX        = 'audio-';
const AUDIO_EXTENSION     = '.mp3';
const STORAGE_KEY_INDEX   = 'familyPlayer_currentIndex';
const STORAGE_KEY_THEME   = 'familyPlayer_theme';
const STORAGE_KEY_SCROLLS = 'familyPlayer_scrollPositions';

/* Scroll-back factor: restores to 80% of saved position so user re-reads a few lines */
const SCROLL_RESTORE_FACTOR = 0.80;

/* ── State ── */
let currentRecordingIndex  = 0;   /* 0-based internally, displayed as 1-based */
let userHasInteracted      = false;

/* ── DOM References (populated after DOMContentLoaded) ── */
let audioElement;
let progressBarFill;
let progressBarContainer;
let playPauseButton;
let prevButton;
let nextButton;
let downloadButton;
let themeToggleButton;
let recordingCounterLabel;
let descriptionTitle;
let descriptionBodyText;
let interactionPromptOverlay;

/* ── Build zero-padded filename ── */
/* e.g. index 0 → "audio-0001.mp3" */
function buildAudioFilePath(zeroBasedIndex) {
  const oneBasedNumber = zeroBasedIndex + 1;
  const paddedNumber   = String(oneBasedNumber).padStart(4, '0');
  return `${AUDIO_FOLDER}${AUDIO_PREFIX}${paddedNumber}${AUDIO_EXTENSION}`;
}

/* ── Build display number string ── */
function buildDisplayNumber(zeroBasedIndex) {
  return String(zeroBasedIndex + 1).padStart(4, '0');
}

/* ── Load a recording by index (does NOT auto-play) ── */
/* Auto-advance after 'ended' event IS allowed once user has interacted. */
function loadRecordingAtIndex(newIndex, shouldAutoPlay) {
  try {
    /* Clamp index to valid range */
    const clampedIndex = Math.max(0, Math.min(TOTAL_RECORDINGS - 1, newIndex));
    currentRecordingIndex = clampedIndex;

    /* Build file path */
    const filePath = buildAudioFilePath(clampedIndex);

    /* Update audio element src */
    audioElement.src = filePath;
    audioElement.load();

    /* Update counter label */
    recordingCounterLabel.textContent =
      `${buildDisplayNumber(clampedIndex)} / ${TOTAL_RECORDINGS}`;

   
    // // Update description title immediately
    // descriptionTitle.textContent =
    //  `Recordingg ${buildDisplayNumber(clampedIndex)}`;
    

    /* Load description body from separate file asynchronously */
    const descriptionRegion = descriptionTitle.closest('.description-region');
    descriptionBodyText.textContent = '...';
    loadDescriptionForIndex(clampedIndex, function(descriptionText) {
      descriptionBodyText.textContent = descriptionText;
      /* Restore saved scroll position (at 80%) after text is rendered */
      restoreScrollPosition(clampedIndex, descriptionRegion);
    });

    /* Update prev/next button disabled states */
    prevButton.disabled = (clampedIndex === 0);
    nextButton.disabled = (clampedIndex === TOTAL_RECORDINGS - 1);

    /* Update download button href */
    downloadButton.href     = filePath;
    downloadButton.download = `${AUDIO_PREFIX}${buildDisplayNumber(clampedIndex)}${AUDIO_EXTENSION}`;

    /* Persist index to localStorage */
    try {
      localStorage.setItem(STORAGE_KEY_INDEX, String(clampedIndex));
    } catch (storageError) {
      /* localStorage may be unavailable in some private browsers — not critical */
      console.warn('localStorage unavailable:', storageError);
    }

    /* Auto-play only if user has interacted AND caller requests it */
    if (shouldAutoPlay && userHasInteracted) {
      playAudio();
    } else {
      /* Reflect paused state in button */
      updatePlayPauseButtonIcon();
    }

  } catch (loadError) {
    console.error('Error loading recording at index', newIndex, loadError);
  }
}

/* ── Play audio (returns promise, handles mobile rejection gracefully) ── */
function playAudio() {
  try {
    const playPromise = audioElement.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          updatePlayPauseButtonIcon();
        })
        .catch((playError) => {
          /* Mobile browsers block autoplay — show prompt again if needed */
          console.warn('Playback prevented by browser:', playError);
          updatePlayPauseButtonIcon();
        });
    }
  } catch (playError) {
    console.error('playAudio error:', playError);
  }
}

/* ── Pause audio ── */
function pauseAudio() {
  try {
    audioElement.pause();
    updatePlayPauseButtonIcon();
  } catch (pauseError) {
    console.error('pauseAudio error:', pauseError);
  }
}

/* ── Toggle play / pause ── */
function togglePlayPause() {
  /* First interaction gate — dismiss overlay and attempt play */
  if (!userHasInteracted) {
    userHasInteracted = true;
    dismissInteractionPrompt();
  }

  if (audioElement.paused) {
    playAudio();
  } else {
    pauseAudio();
  }
}

/* ── Update play/pause button emoji ── */
function updatePlayPauseButtonIcon() {
  playPauseButton.textContent = audioElement.paused ? '▶️' : '⏸️';
}

/* ── Navigate to previous recording ── */
function goToPreviousRecording() {
  if (currentRecordingIndex > 0) {
    const wasPlaying = !audioElement.paused;
    loadRecordingAtIndex(currentRecordingIndex - 1, wasPlaying);
  }
}

/* ── Navigate to next recording ── */
function goToNextRecording() {
  if (currentRecordingIndex < TOTAL_RECORDINGS - 1) {
    const wasPlaying = !audioElement.paused;
    loadRecordingAtIndex(currentRecordingIndex + 1, wasPlaying);
  }
}

/* ── Auto-advance when audio ends ── */
function handleAudioEnded() {
  if (currentRecordingIndex < TOTAL_RECORDINGS - 1) {
    /* Auto-advance: load next and play (user already interacted at this point) */
    loadRecordingAtIndex(currentRecordingIndex + 1, true);
  } else {
    /* Last recording finished — just reflect paused state */
    updatePlayPauseButtonIcon();
  }
}

/* ── Update progress bar during playback ── */
function handleAudioTimeUpdate() {
  try {
    if (audioElement.duration && audioElement.duration > 0) {
      const progressPercent = (audioElement.currentTime / audioElement.duration) * 100;
      progressBarFill.style.width = `${progressPercent}%`;
    }
  } catch (timeError) {
    /* Non-critical, skip */
  }
}

/* ── Seek on progress bar click/tap ── */
function handleProgressBarSeek(pointerEvent) {
  try {
    const barRect     = progressBarContainer.getBoundingClientRect();
    const clickX      = pointerEvent.clientX - barRect.left;
    const seekRatio   = Math.max(0, Math.min(1, clickX / barRect.width));
    if (audioElement.duration && audioElement.duration > 0) {
      audioElement.currentTime = seekRatio * audioElement.duration;
    }
  } catch (seekError) {
    console.error('Seek error:', seekError);
  }
}

/* ── Toggle dark / light theme ── */
function toggleTheme() {
  try {
    const isCurrentlyLight = document.body.classList.contains('theme-light');
    if (isCurrentlyLight) {
      document.body.classList.remove('theme-light');
      themeToggleButton.textContent = '☀️';
      localStorage.setItem(STORAGE_KEY_THEME, 'dark');
    } else {
      document.body.classList.add('theme-light');
      themeToggleButton.textContent = '🌙';
      localStorage.setItem(STORAGE_KEY_THEME, 'light');
    }
  } catch (themeError) {
    console.error('Theme toggle error:', themeError);
  }
}

/* ── Dismiss the interaction prompt overlay ── */
function dismissInteractionPrompt() {
  interactionPromptOverlay.classList.add('hidden');
}

/* ── Handle tap on interaction prompt overlay ── */
/* Just dismisses the gate — user must press play manually */
function handleInteractionPromptTap() {
  userHasInteracted = true;
  dismissInteractionPrompt();
}

/* ── Restore saved preferences from localStorage ── */
function restoreSavedPreferences() {
  try {
    /* Restore theme */
    const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
    if (savedTheme === 'light') {
      document.body.classList.add('theme-light');
      themeToggleButton.textContent = '🌙';
    } else {
      themeToggleButton.textContent = '☀️';
    }

    /* Restore last recording index */
    const savedIndex = localStorage.getItem(STORAGE_KEY_INDEX);
    if (savedIndex !== null) {
      const parsedIndex = parseInt(savedIndex, 10);
      if (!isNaN(parsedIndex) && parsedIndex >= 0 && parsedIndex < TOTAL_RECORDINGS) {
        return parsedIndex;
      }
    }
  } catch (storageError) {
    console.warn('Could not restore preferences:', storageError);
  }
  return 0; /* Default to first recording */
}

/* ── Save scroll position for the current recording ── */
function saveScrollPosition(zeroBasedIndex, scrollTop) {
  try {
    const allScrollPositions = JSON.parse(localStorage.getItem(STORAGE_KEY_SCROLLS) || '{}');
    allScrollPositions[zeroBasedIndex] = scrollTop;
    localStorage.setItem(STORAGE_KEY_SCROLLS, JSON.stringify(allScrollPositions));
  } catch (storageError) {
    console.warn('Could not save scroll position:', storageError);
  }
}

/* ── Restore scroll position for a given recording ── */
/* Applies SCROLL_RESTORE_FACTOR so user re-reads a few lines */
function restoreScrollPosition(zeroBasedIndex, descriptionRegionElement) {
  try {
    const allScrollPositions = JSON.parse(localStorage.getItem(STORAGE_KEY_SCROLLS) || '{}');
    const savedScrollTop = allScrollPositions[zeroBasedIndex];
    if (savedScrollTop && savedScrollTop > 0) {
      const restoredScrollTop = Math.floor(savedScrollTop * SCROLL_RESTORE_FACTOR);
      descriptionRegionElement.scrollTop = restoredScrollTop;
    } else {
      descriptionRegionElement.scrollTop = 0;
    }
  } catch (storageError) {
    console.warn('Could not restore scroll position:', storageError);
    descriptionRegionElement.scrollTop = 0;
  }
}

/* ── Load description for a given index via dynamic script injection ──
   Each recording has its own file: data/text/desc-0001.js etc.
   Each file calls onDescriptionLoaded("text here") when executed.
   This approach works with file:// protocol (no fetch needed).
   The injected script tag is removed after execution. ── */
function loadDescriptionForIndex(zeroBasedIndex, callbackFn) {
  try {
    const paddedNumber = String(zeroBasedIndex + 1).padStart(4, '0');
    const scriptPath   = `./data/text/desc-${paddedNumber}.js`;

    /* Remove any previously injected description script tag */
    const existingScriptTag = document.getElementById('dynamic-description-script');
    if (existingScriptTag) {
      existingScriptTag.parentNode.removeChild(existingScriptTag);
    }

    /* Register the global callback that the loaded script will call */
    window.onDescriptionLoaded = function(descriptionText) {
      /* Clean up the global callback immediately after use */
      window.onDescriptionLoaded = null;
      callbackFn(descriptionText);
    };

    /* Inject new script tag to load the description file */
    const newScriptTag    = document.createElement('script');
    newScriptTag.id       = 'dynamic-description-script';
    newScriptTag.src      = scriptPath;

    /* Remove script tag from DOM after it executes (prevent memory leak) */
    newScriptTag.onload   = function() {
      if (newScriptTag.parentNode) {
        newScriptTag.parentNode.removeChild(newScriptTag);
      }
    };

    /* Handle missing file gracefully */
    newScriptTag.onerror  = function() {
      window.onDescriptionLoaded = null;
      if (newScriptTag.parentNode) {
        newScriptTag.parentNode.removeChild(newScriptTag);
      }
      callbackFn('No description available for this recording.');
    };

    document.head.appendChild(newScriptTag);

  } catch (loadError) {
    console.error('loadDescriptionForIndex error:', loadError);
    callbackFn('No description available.');
  }
}

/* ── Wire up all event listeners ── */
function attachEventListeners() {
  /* Play / Pause button */
  playPauseButton.addEventListener('click', togglePlayPause);

  /* Previous recording button */
  prevButton.addEventListener('click', goToPreviousRecording);

  /* Next recording button */
  nextButton.addEventListener('click', goToNextRecording);

  /* Theme toggle */
  themeToggleButton.addEventListener('click', toggleTheme);

  /* Audio events */
  audioElement.addEventListener('ended',      handleAudioEnded);
  audioElement.addEventListener('timeupdate', handleAudioTimeUpdate);
  audioElement.addEventListener('play',       updatePlayPauseButtonIcon);
  audioElement.addEventListener('pause',      updatePlayPauseButtonIcon);

  /* Progress bar seek */
  progressBarContainer.addEventListener('click', handleProgressBarSeek);

  /* Save scroll position as user scrolls the description */
  const descriptionRegion = document.querySelector('.description-region');
  descriptionRegion.addEventListener('scroll', function() {
    saveScrollPosition(currentRecordingIndex, descriptionRegion.scrollTop);
  });

  /* Interaction prompt tap (mobile autoplay gate) */
  interactionPromptOverlay.addEventListener('click', handleInteractionPromptTap);
}

/* ── Main initialisation ── */
function initialisePlayer() {
  /* Grab all DOM references */
  audioElement             = document.getElementById('audio-element');
  progressBarFill          = document.getElementById('progress-bar-fill');
  progressBarContainer     = document.getElementById('progress-bar-container');
  playPauseButton          = document.getElementById('play-pause-button');
  prevButton               = document.getElementById('prev-button');
  nextButton               = document.getElementById('next-button');
  downloadButton           = document.getElementById('download-button');
  themeToggleButton        = document.getElementById('theme-toggle-button');
  recordingCounterLabel    = document.getElementById('recording-counter');
  descriptionTitle         = document.getElementById('description-title');
  descriptionBodyText      = document.getElementById('description-body');
  interactionPromptOverlay = document.getElementById('interaction-prompt');

  /* Wire events */
  attachEventListeners();

  /* Restore saved preferences and get starting index */
  const startingIndex = restoreSavedPreferences();

  /* Load the starting recording (no autoplay — wait for interaction) */
  loadRecordingAtIndex(startingIndex, false);
}

/* ── Boot on DOM ready ── */
document.addEventListener('DOMContentLoaded', initialisePlayer);
