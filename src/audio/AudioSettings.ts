import type { AudioSettings } from '@/audio/AudioSettings.types'

const PLACEHOLDER_SOUND_FILES = ['/sounds/brick/brick1.wav']

export const AUDIO_SETTINGS: AudioSettings = {
  enabled: true,
  mix: {
    masterVolume: 1,
    sfxMasterVolume: 1,
    musicMasterVolume: 1,
  },
  banks: {
    pop: {
      files: [
        '/sounds/pop/pop1.wav',
        '/sounds/pop/pop2.wav',
        '/sounds/pop/pop3.wav',
        '/sounds/pop/pop4.wav',
      ],
      volume: 1,
    },
    felt: {
      files: [
        '/sounds/felt/felt1.wav',
        '/sounds/felt/felt2.wav',
        '/sounds/felt/felt3.wav',
      ],
      volume: 1,
    },
    steel: {
      files: [
        '/sounds/steel/steel1.wav',
        '/sounds/steel/steel2.wav',
        '/sounds/steel/steel3.wav',
      ],
      volume: 0.5,
    },
    error: {
      files: [
        '/sounds/error/error1.wav',
        '/sounds/error/error2.wav',
        '/sounds/error/error3.wav',
        '/sounds/error/error4.wav',
      ],
      volume: 1,
    },
    bee: {
      files: ['/sounds/bee/bee1.wav'],
      volume: 1.2,
    },
    swoosh: {
      files: [
        '/sounds/swoosh/swoosh1.wav',
        '/sounds/swoosh/swoosh2.wav',
        '/sounds/swoosh/swoosh3.wav',
        '/sounds/swoosh/swoosh4.wav',
        '/sounds/swoosh/swoosh65.wav',
      ],
      volume: 0,
    },
    comboTier2: {
      files: [
        '/sounds/yes/yes1.wav',
        '/sounds/yes/yes2.wav',
        '/sounds/yes/yes3.wav',
        // '/sounds/doublecombo/doublecombo1.mp3',
        // '/sounds/doublecombo/doublecombo2.mp3',
      ],
      volume: 0.5,
    },
    comboTier3: {
      files: [
        '/sounds/yes/yes1.wav',
        '/sounds/yes/yes2.wav',
        '/sounds/yes/yes3.wav',
        // '/sounds/triplecombo/triplecombo1.mp3',
        // '/sounds/triplecombo/triplecombo2.mp3',
        // '/sounds/triplecombo/triplecombo3.mp3',
      ],
      volume: 0.7,
    },
    comboTier4Plus: {
      files: [
        '/sounds/yes/yes1.wav',
        '/sounds/yes/yes2.wav',
        '/sounds/yes/yes3.wav',
        // '/sounds/quadruplecombo/quadruplecombo1.mp3',
        // '/sounds/quadruplecombo/quadruplecombo2.mp3',
      ],
      volume: 1,
    },
    timeBonus: {
      files: [
        '/sounds/timebonus/timebonus1.mp3',
        '/sounds/timebonus/timebonus2.mp3',
        '/sounds/timebonus/timebonus3.mp3',
      ],
      volume: 0,
    },
    roller: {
      files: [
        '/sounds/steamroller/steamroller1.mp3',
        '/sounds/steamroller/steamroller2.mp3',
        '/sounds/steamroller/steamroller3.mp3',
      ],
      volume: 0,
    },
    slowmo: {
      files: [
        '/sounds/slowmotion/slowmotion1.mp3',
        '/sounds/slowmotion/slowmotion2.mp3',
        '/sounds/slowmotion/slowmotion3.mp3',
      ],
      volume: 0,
    },
    zeroGravity: {
      files: [
        '/sounds/zerogravity/zerogravity1.mp3',
        '/sounds/zerogravity/zerogravity2.mp3',
      ],
      volume: 0,
    },
    multiBalls: {
      files: PLACEHOLDER_SOUND_FILES,
      volume: 0,
    },
    runStarted: {
      files: [
        '/sounds/letsgo/letsgo1.mp3',
        '/sounds/letsgo/okayletsgo1.mp3',
        '/sounds/letsgo/okayletsgo2.mp3',
      ],
      volume: 0,
    },
    gameOver: {
      files: PLACEHOLDER_SOUND_FILES,
      volume: 0,
    },
    highScoreEntry: {
      files: PLACEHOLDER_SOUND_FILES,
      volume: 0,
    },
    idleStarted: {
      files: PLACEHOLDER_SOUND_FILES,
      volume: 0,
    },
    tenSecondsLeft: {
      files: PLACEHOLDER_SOUND_FILES,
      volume: 0,
    },
    highScoreEntryHover: {
      files: PLACEHOLDER_SOUND_FILES,
      volume: 0,
    },
    highScoreEntryLock: {
      files: PLACEHOLDER_SOUND_FILES,
      volume: 0,
    },
  },
  music: {
    enabled: true,
    loops: {
      goodvibes_loop_1: {
        file: '/sounds/goodvibes/goodvibes_loop_1.wav',
        volume: 1,
        switchMarkersSec: [2, 4, 6],
      },
      goodvibes_loop_2: {
        file: '/sounds/goodvibes/goodvibes_loop_2.wav',
        volume: 1,
        switchMarkersSec: [2, 4, 6],
      },
      goodvibes_loop_3: {
        file: '/sounds/goodvibes/goodvibes_loop_3.wav',
        volume: 1,
        switchMarkersSec: [2, 4, 6, 8, 10, 12, 14],
      },
      goodvibes_loop_4: {
        file: '/sounds/goodvibes/goodvibes_loop_4.wav',
        volume: 1,
        switchMarkersSec: [2, 4, 6, 8, 10, 12, 14],
      },
      goodvibes_loop_5: {
        file: '/sounds/goodvibes/goodvibes_loop_5.wav',
        volume: 1,
        switchMarkersSec: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30],
      },
      goodvibes_loop_6: {
        file: '/sounds/goodvibes/goodvibes_loop_6.wav',
        volume: 1,
        switchMarkersSec: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30],
      },
      goodvibes_loop_7: {
        file: '/sounds/goodvibes/goodvibes_loop_7.wav',
        volume: 1,
        switchMarkersSec: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30],
      },
      pinjacolada_loop_1: {
        file: '/sounds/pinjacolada/pinjacolada_loop_1.wav',
        volume: 1,
        switchMarkersSec: [2, 4, 6],
      },
      pinjacolada_loop_2: {
        file: '/sounds/pinjacolada/pinjacolada_loop_2.wav',
        volume: 1,
        switchMarkersSec: [2, 4, 6, 8, 10, 12, 14],
      },
    },
    runSequence: {
      volume: .75,
      timeline: [
        { atSec: 0, loopId: 'goodvibes_loop_1' },
        { atSec: 8, loopId: 'goodvibes_loop_2' },
        { atSec: 16, loopId: 'goodvibes_loop_3' },
        { atSec: 32, loopId: 'goodvibes_loop_4' },
        { atSec: 48, loopId: 'goodvibes_loop_5' },
        { atSec: 80, loopId: 'goodvibes_loop_6' },
        { atSec: 112, loopId: 'goodvibes_loop_7' },
      ],
    },
    eventSequences: {
      game_over: {
        volume: .5,
        timelineByLoop: [
          { atLoop: 0, loopId: 'pinjacolada_loop_1' },
        ],
      },
    },
    idleSequence: {
      volume: 0.5,
      timeline: [
        { atSec: 0, loopId: 'pinjacolada_loop_2' },
      ],
    },
  },
  rules: {
    swoosh: {
      minVelocity: 300,
      maxVelocity: 2000,
      cooldownMs: 300,
    },
  },
}
