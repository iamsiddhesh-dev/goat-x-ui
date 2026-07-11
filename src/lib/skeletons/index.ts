import type { AnimationIntentId } from '../schema'
import type { SectionSkeletonFn } from '../vocabulary'
import { noneSkeleton } from './none'
import { fadeUpStaggerSkeleton } from './fade-up-stagger'
import { splitTextRevealSkeleton } from './split-text-reveal'
import { maskWipeSkeleton } from './mask-wipe'
import { scaleSettleSkeleton } from './scale-settle'
import { parallaxDriftSkeleton } from './parallax-drift'
import { reverseParallaxSkeleton } from './reverse-parallax'
import { scrubChoreographySkeleton } from './scrub-choreography'
import { horizontalScrollTrackSkeleton } from './horizontal-scroll-track'
import { stickyCardStackSkeleton } from './sticky-card-stack'
import { pinnedStepSequenceSkeleton } from './pinned-step-sequence'
import { marqueeLoopSkeleton } from './marquee-loop'

/* ============================================================================
 * Fallback skeleton registry (AGENT_SPEC §4.5, §6 F5).
 *
 * The deterministic, known-good implementation of each intent. Used when
 * codegen fails twice (origin: 'fallback'). Phase 5 is filling in the
 * remaining intents one at a time; unimplemented ones still degrade to the
 * fade-up-stagger skeleton, which is correct for any copy.
 * ========================================================================== */

const SKELETONS: Partial<Record<AnimationIntentId, SectionSkeletonFn>> = {
  none: noneSkeleton,
  'fade-up-stagger': fadeUpStaggerSkeleton,
  'split-text-reveal': splitTextRevealSkeleton,
  'mask-wipe': maskWipeSkeleton,
  'scale-settle': scaleSettleSkeleton,
  'parallax-drift': parallaxDriftSkeleton,
  'reverse-parallax': reverseParallaxSkeleton,
  'scrub-choreography': scrubChoreographySkeleton,
  'horizontal-scroll-track': horizontalScrollTrackSkeleton,
  'sticky-card-stack': stickyCardStackSkeleton,
  'pinned-step-sequence': pinnedStepSequenceSkeleton,
  'marquee-loop': marqueeLoopSkeleton,
}

/** The fallback skeleton for an intent (fade-up-stagger for the unimplemented). */
export function skeletonFor(intent: AnimationIntentId): SectionSkeletonFn {
  return SKELETONS[intent] ?? fadeUpStaggerSkeleton
}

export {
  noneSkeleton,
  fadeUpStaggerSkeleton,
  splitTextRevealSkeleton,
  maskWipeSkeleton,
  scaleSettleSkeleton,
  parallaxDriftSkeleton,
  reverseParallaxSkeleton,
  scrubChoreographySkeleton,
  horizontalScrollTrackSkeleton,
  stickyCardStackSkeleton,
  pinnedStepSequenceSkeleton,
  marqueeLoopSkeleton,
}
