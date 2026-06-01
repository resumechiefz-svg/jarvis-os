/**
 * Global voice state — shared across all audio components
 * Ensures Jarvis NEVER speaks over AB
 */

type Listener = (speaking: boolean) => void
const listeners = new Set<Listener>()

let _userSpeaking = false
let _activeAudio: HTMLAudioElement | null = null

export const voiceState = {
  // Called when mic detects AB speaking
  setUserSpeaking(speaking: boolean) {
    _userSpeaking = speaking
    if (speaking) {
      // Immediately pause any Jarvis audio
      if (_activeAudio && !_activeAudio.paused) {
        _activeAudio.pause()
        _activeAudio.currentTime = 0
      }
    }
    listeners.forEach(l => l(speaking))
  },

  isUserSpeaking: () => _userSpeaking,

  // Register any playing audio so it can be killed on speech detection
  registerAudio(audio: HTMLAudioElement) {
    _activeAudio = audio
  },

  // Play audio — only if user isn't speaking
  async playAudio(audio: HTMLAudioElement): Promise<void> {
    if (_userSpeaking) return // Never interrupt AB
    _activeAudio = audio
    return audio.play().catch(() => {})
  },

  subscribe(fn: Listener) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}
