import type { AudioSettings } from '@/audio/AudioSettings.types'

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
      ],
      volume: 0.5,
    },
    comboTier3: {
      files: [
        '/sounds/yes/yes1.wav',
        '/sounds/yes/yes2.wav',
        '/sounds/yes/yes3.wav',
      ],
      volume: 0.7,
    },
    comboTier4Plus: {
      files: [
        '/sounds/yes/yes1.wav',
        '/sounds/yes/yes2.wav',
        '/sounds/yes/yes3.wav',
      ],
      volume: 1,
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
