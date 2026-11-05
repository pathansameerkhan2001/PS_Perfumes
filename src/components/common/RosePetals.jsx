import React from 'react';
import Atmosphere from './Atmosphere';

/**
 * A few slowly falling rose petals for selected sections (see Atmosphere: CSS only, paused
 * off-screen and in hidden tabs, hidden for reduced motion). The parent must be
 * position: relative.
 */
export default function RosePetals() {
  return <Atmosphere petals />;
}
