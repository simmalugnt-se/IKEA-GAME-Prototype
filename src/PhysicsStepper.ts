import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'

export function PhysicsStepper() {
  const { step } = useRapier()

  useFrame((_, delta) => {
    // Vi kör fysiken manuellt här med step()
    // Prioritet 1 gör att detta sker efter Reacts updates men före rendering
    step(delta)
  }, 1)

  return null
}
