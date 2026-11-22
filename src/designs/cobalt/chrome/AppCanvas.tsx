import { CobaltGlows } from "../Glow";

export function AppCanvas({ children }: { children: React.ReactNode }) {
  return (
    <div className="co-w">
      <CobaltGlows placement="app" />
      {children}
    </div>
  );
}
