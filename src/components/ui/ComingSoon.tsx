interface ComingSoonProps {
  name: string;
  phase: number;
}

export function ComingSoon({ name, phase }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400">
      <p className="text-2xl font-semibold text-gray-300">{name}</p>
      <p className="mt-2 text-sm">Coming in Phase {phase}</p>
    </div>
  );
}
