import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'

export function PhysicsStepper() {
  const { step } = useRapier()

  useFrame((_state, delta) => {
    // Vi kör fysiken manuellt här med step()
    // Prioritet 1 gör att detta sker efter Reacts updates men före rendering
    step()
  }, 1)

  return null
}