import { Container } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import { SessionAttachmentRagDevContent } from '@/components/dev/SessionAttachmentRagDevPane'

export const Route = createFileRoute('/dev/session-rag')({
  component: SessionRagDevPage,
})

function SessionRagDevPage() {
  return (
    <Container size="xl" py="xl">
      <SessionAttachmentRagDevContent />
    </Container>
  )
}
