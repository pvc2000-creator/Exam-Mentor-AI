"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";

export function ScoreTrend({ data }: { data: Array<{ label: string; score: number; accuracy: number | null }> }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Line chart of your score percentage for each completed mock, oldest to newest">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
          <Tooltip formatter={(v: number) => `${v}%`} />
          <Line isAnimationActive={false} type="monotone" dataKey="score" name="Score" stroke="#2453e0" strokeWidth={2} dot={{ r: 3 }} />
          <Line isAnimationActive={false} type="monotone" dataKey="accuracy" name="Accuracy (attempted)" stroke="#0d9488" strokeWidth={2} strokeDasharray="4 3" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SubjectBars({ data }: { data: Array<{ name: string; accuracy: number }> }) {
  return (
    <div className="h-56 w-full" role="img" aria-label="Bar chart of accuracy by subject">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => `${v}%`} />
          <ReferenceLine x={50} stroke="#94a3b8" strokeDasharray="3 3" />
          <Bar isAnimationActive={false} dataKey="accuracy" name="Accuracy" fill="#3b6cf6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MasteryHistory({ data }: { data: Array<{ label: string; mastery: number }> }) {
  return (
    <div className="h-48 w-full" role="img" aria-label="Line chart of estimated mastery after each attempt">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => `${v}%`} />
          <ReferenceLine y={72} stroke="#10b981" strokeDasharray="4 3" label={{ value: "mastery gate", fontSize: 10, fill: "#10b981", position: "insideTopRight" }} />
          <Line isAnimationActive={false} type="monotone" dataKey="mastery" stroke="#2453e0" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
