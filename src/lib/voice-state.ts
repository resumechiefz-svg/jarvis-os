/**
 * Global voice state — ONE audio source at a time, no exceptions
 * All audio (ElevenLabs, VoiceInterrupt, Greeting) routes through here
 * If something is playing, new audio is queued or dropped
 */

type Listener = (speaking: boolean) => void
const listeners = new Set<Listener>()

let _userSpeaking = false
let _activeAudio: HTMLAudioElement | null = null
let _isSpeaking = false  // Jarvis is currently talking

export const voiceState = {
  setUserSpeaking(speaking: boolean) {
    _userSpeaking = speaking
    if (speaking) {
      // AB started talking — kill Jarvis immediately
      if (_activeAudio) {
        _activeAudio.pause()
        _activeAudio.currentTime = 0
        _activeAudio = null
      }
      _isSpeaking = false
    }
    listeners.forEach(l => l(speaking))
  },

  isUserSpeaking: () => _userSpeaking,
  isSpeaking: () => _isSpeaking,

  registerAudio(audio: HTMLAudioElement) {
    _activeAudio = audio
  },

  // Primary method — enforces one voice at a time
  async playAudio(audio: HTMLAudioElement): Promise<void> {
    if (_userSpeaking) return
    // Stop anything currently playing first
    if (_activeAudio && !_activeAudio.paused) {
      _activeAudio.pause()
      _activeAudio.currentTime = 0
    }
    _activeAudio = audio
    _isSpeaking = true
    audio.onended = () => { _isSpeaking = false; _activeAudio = null }
    audio.onerror = () => { _isSpeaking = false; _activeAudio = null }
    return audio.play().catch(() => { _isSpeaking = false })
  },

  stopAll() {
    if (_activeAudio) {
      _activeAudio.pause()
      _activeAudio.currentTime = 0
      _activeAudio = null
    }
    _isSpeaking = false
  },

  subscribe(fn: Listener) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}
