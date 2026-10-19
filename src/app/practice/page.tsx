import { requirePageUser } from "@/lib/server/auth";
import { topicCatalog } from "@/lib/server/queries";
import { Card, PageHeader } from "@/components/ui";
import { MockPicker } from "@/components/MockPicker";

export const metadata = { title: "Practice · ExamMentor AI" };

export default async function PracticePage({ searchParams }: { searchParams: Promise<{ topic?: string; feedback?: string }> }) {
  await requirePageUser();
  const { topic, feedback } = await searchParams;
  const catalog = await topicCatalog();
  const subjects = catalog.subjects.map((s) => ({ id: s.id, name: s.name, topics: s.topics.map((t) => ({ id: t.id, name: t.name })) }));
  const initialTopic = topic && catalog.topicName.has(topic) ? topic : undefined;
  return (
    <div className="space-y-6">
      <PageHeader title="Topic practice" subtitle="Practise one topic. With feedback after each question you see the answer, the explanation and why your choice was wrong before moving on; your answer is locked once feedback is shown." />
      <Card>
        <MockPicker subjects={subjects} only={["TOPIC_PRACTICE"]} initialType="TOPIC_PRACTICE" initialTopic={initialTopic} initialFeedback={feedback === "end" ? "END_OF_SET" : "IMMEDIATE"} />
      </Card>
    </div>
  );
}
