import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";

export default function Effects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.3} intensity={0.85} mipmapBlur radius={0.7} />
      <Vignette eskil={false} offset={0.22} darkness={0.7} />
    </EffectComposer>
  );
}
