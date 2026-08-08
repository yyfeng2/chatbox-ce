import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  Modal,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { IconExternalLink, IconEye, IconFileText, IconSearch } from '@tabler/icons-react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { ScalableIcon } from '@/components/common/ScalableIcon'
import {
  type UiInventoryItem,
  uiInventoryGeneratedAt,
  uiInventoryItems,
  uiInventorySummary,
} from '@/dev/uiInventory.generated'

export const Route = createFileRoute('/dev/ui-inventory')({
  component: UiInventoryPage,
})

const kindLabels: Record<string, string> = {
  page: 'Pages',
  component: 'Components',
  'route-component': 'Route Components',
  modal: 'Modals',
  story: 'Storybook',
  ui: 'UI',
}

const previewableKinds = new Set(['page', 'story'])
const areaCounts: Record<string, number> = uiInventorySummary.byArea

function UiInventoryPage() {
  const [query, setQuery] = useState('')
  const [activeKind, setActiveKind] = useState<string | null>(null)
  const [activeArea, setActiveArea] = useState<string | null>(null)
  const [activePlatform, setActivePlatform] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<UiInventoryItem | null>(null)
  const realPreviewCount = useMemo(() => uiInventoryItems.filter((item) => item.previewLinks.length > 0).length, [])
  const missingPreviewCount = uiInventorySummary.total - realPreviewCount

  const areaOptions = useMemo(
    () =>
      Object.keys(uiInventorySummary.byArea)
        .sort((a, b) => a.localeCompare(b))
        .map((area) => ({ value: area, label: `${area} (${areaCounts[area]})` })),
    []
  )
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return uiInventoryItems.filter((item) => {
      if (activeKind && item.kind !== activeKind) return false
      if (activeArea && item.area !== activeArea) return false
      if (activePlatform && !item.platforms.includes(activePlatform)) return false
      if (!normalizedQuery) return true
      return [
        item.path,
        item.title,
        item.kind,
        item.area,
        item.route ?? '',
        ...item.components,
        ...item.platforms,
        ...item.platformNotes,
        ...item.previewModes,
        ...item.states,
        ...item.variants,
        ...item.text,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })
  }, [activeArea, activeKind, activePlatform, query])

  const kindOptions = Object.entries(uiInventorySummary.byKind).sort(([a], [b]) => a.localeCompare(b))

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <Box>
            <Title order={1}>UI Inventory</Title>
            <Text c="dimmed" size="sm">
              Complete code-derived page and component catalog with detected platform signals, states, variants, text,
              and preview links.
            </Text>
          </Box>
          <Button
            component="a"
            href="/docs/ui-inventory.md"
            variant="light"
            leftSection={<ScalableIcon icon={IconFileText} />}
          >
            Markdown
          </Button>
        </Group>

        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
          <Metric label="UI TSX files" value={uiInventorySummary.total} />
          <Metric label="Pages" value={uiInventorySummary.byKind.page ?? 0} />
          <Metric
            label="Components"
            value={(uiInventorySummary.byKind.component ?? 0) + (uiInventorySummary.byKind['route-component'] ?? 0)}
          />
          <Metric label="Modals" value={uiInventorySummary.byKind.modal ?? 0} />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
          <Metric label="Real previews" value={realPreviewCount} />
          <Metric label="Missing fixtures" value={missingPreviewCount} />
          <Metric label="Desktop-specific" value={uiInventorySummary.byPlatform.desktop ?? 0} />
        </SimpleGrid>

        <Paper withBorder p="md" radius="md">
          <Stack gap="md">
            <Group align="end">
              <TextInput
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                leftSection={<ScalableIcon icon={IconSearch} />}
                label="Search"
                placeholder="Search path, component, state, variant, or text"
                className="flex-1"
              />
              <Select
                label="Area"
                placeholder="All areas"
                data={areaOptions}
                value={activeArea}
                onChange={setActiveArea}
                clearable
                w={220}
              />
            </Group>

            <Box>
              <Text size="sm" fw={500} mb={6}>
                Platform Signal
              </Text>
              <SegmentedControl
                value={activePlatform ?? 'all'}
                onChange={(value) => setActivePlatform(value === 'all' ? null : value)}
                data={[
                  { label: `All (${uiInventorySummary.total})`, value: 'all' },
                  { label: `Desktop (${uiInventorySummary.byPlatform.desktop ?? 0})`, value: 'desktop' },
                  { label: `Mobile (${uiInventorySummary.byPlatform.mobile ?? 0})`, value: 'mobile' },
                  { label: `Web (${uiInventorySummary.byPlatform.web ?? 0})`, value: 'web' },
                ]}
              />
            </Box>

            <Tabs value={activeKind ?? 'all'} onChange={(value) => setActiveKind(value === 'all' ? null : value)}>
              <Tabs.List>
                <Tabs.Tab value="all">All ({uiInventorySummary.total})</Tabs.Tab>
                {kindOptions.map(([kind, count]) => (
                  <Tabs.Tab key={kind} value={kind}>
                    {kindLabels[kind] ?? kind} ({count})
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs>
          </Stack>
        </Paper>

        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Showing {filteredItems.length} of {uiInventoryItems.length}. Generated at{' '}
            {new Date(uiInventoryGeneratedAt).toLocaleString()}.
          </Text>
          <Badge variant="light">{activeArea ?? 'all areas'}</Badge>
          {activePlatform && <Badge variant="light">{activePlatform}</Badge>}
        </Group>

        <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
          {filteredItems.map((item) => (
            <InventoryCard key={item.path} item={item} onPreview={() => setPreviewItem(item)} />
          ))}
        </SimpleGrid>

        {filteredItems.length === 0 && (
          <Paper withBorder p="xl" radius="md">
            <Text ta="center" c="dimmed">
              No inventory entries match the current filters.
            </Text>
          </Paper>
        )}
      </Stack>

      <Modal
        opened={Boolean(previewItem)}
        onClose={() => setPreviewItem(null)}
        title={previewItem ? `Preview: ${previewItem.title}` : 'Preview'}
        size="xl"
        centered
      >
        {previewItem && <ComponentPreview item={previewItem} />}
      </Modal>
    </Container>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
        {label}
      </Text>
      <Text size="xl" fw={700}>
        {value}
      </Text>
    </Paper>
  )
}

function InventoryCard({ item, onPreview }: { item: UiInventoryItem; onPreview: () => void }) {
  const previewLabel = item.kind === 'story' ? 'Run Storybook' : item.route ? 'Open Route' : undefined
  const hasRealPreview = item.previewLinks.length > 0

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Box className="min-w-0">
            <Group gap="xs" mb={4}>
              <Badge size="sm" variant="light">
                {kindLabels[item.kind] ?? item.kind}
              </Badge>
              <Badge size="sm" color="gray" variant="light">
                {item.area}
              </Badge>
              {item.route && (
                <Badge size="sm" color="blue" variant="outline">
                  {item.route}
                </Badge>
              )}
            </Group>
            <Text fw={700} truncate>
              {item.title}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {item.path}
            </Text>
          </Box>
          <Group gap="xs" wrap="nowrap">
            <Button
              type="button"
              size="xs"
              variant={hasRealPreview ? 'light' : 'subtle'}
              color={hasRealPreview ? undefined : 'gray'}
              leftSection={<ScalableIcon icon={IconEye} />}
              onClick={onPreview}
            >
              {hasRealPreview ? 'Real Preview' : 'Missing Fixture'}
            </Button>
            {previewLabel &&
              previewableKinds.has(item.kind) &&
              (item.route ? (
                <Button
                  component={Link}
                  to={item.route}
                  size="xs"
                  variant="light"
                  rightSection={<ScalableIcon icon={IconExternalLink} />}
                >
                  {previewLabel}
                </Button>
              ) : (
                <Button component="span" size="xs" variant="light" disabled>
                  {previewLabel}
                </Button>
              ))}
          </Group>
        </Group>

        <InfoRow label="Components" values={item.components} />
        {item.previewLinks.length > 0 && <PreviewLinks links={item.previewLinks} />}
        <InfoRow label="Platform Signals" values={item.platforms} />
        <InfoRow label="Platform Notes" values={item.platformNotes} empty="No platform-specific branch detected" />
        <InfoRow label="Preview Modes" values={item.previewModes} empty="Default viewport only" />
        <InfoRow label="States" values={item.states} empty="No explicit state detected" />
        <InfoRow label="Variants" values={item.variants} empty="No variant props detected" />
        <InfoRow label="Text" values={item.text} empty="No static text detected" scroll />
        {item.stories.length > 0 && <InfoRow label="Stories" values={item.stories} />}
      </Stack>
    </Card>
  )
}

function ComponentPreview({ item }: { item: UiInventoryItem }) {
  const [activePreviewHref, setActivePreviewHref] = useState(() => getPreviewFrameHref(item.previewLinks[0]))
  const hasRealPreview = item.previewLinks.length > 0

  return (
    <Stack gap="md">
      <Paper withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start">
            <Box>
              <Text fw={700}>{item.components[0] ?? item.title}</Text>
              <Text size="xs" c="dimmed">
                {item.path}
              </Text>
            </Box>
            <Badge variant="light">{kindLabels[item.kind] ?? item.kind}</Badge>
          </Group>

          {hasRealPreview ? (
            <Stack gap="sm">
              <Group gap="xs">
                <Badge variant="filled" color="green">
                  Real rendered preview
                </Badge>
                {item.platforms.map((platform) => (
                  <Badge key={platform} variant="light">
                    {platform}
                  </Badge>
                ))}
              </Group>
              <PreviewFrame href={activePreviewHref} />
            </Stack>
          ) : (
            <Paper radius="md" p="md" bg="var(--chatbox-background-secondary)">
              <Stack gap="sm">
                <Group gap="xs">
                  <Badge variant="filled" color="gray">
                    Missing real fixture
                  </Badge>
                  {item.platforms.map((platform) => (
                    <Badge key={platform} variant="light">
                      {platform}
                    </Badge>
                  ))}
                </Group>
                <Text size="sm">
                  This component does not yet have a Storybook story, dev route, or fixture that renders the actual
                  React component. The data below is a source-derived checklist, not a real visual preview.
                </Text>
              </Stack>
            </Paper>
          )}
        </Stack>
      </Paper>

      {item.previewLinks.length > 0 ? (
        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <Text fw={700}>Live Previews</Text>
            <PreviewLinks
              links={item.previewLinks}
              onSelect={(link) => setActivePreviewHref(getPreviewFrameHref(link))}
            />
            <Text size="xs" c="dimmed">
              Storybook links require `pnpm storybook` on port 6006.
            </Text>
          </Stack>
        </Paper>
      ) : null}

      <Paper withBorder radius="md" p="md">
        <Stack gap="sm">
          <Text fw={700}>Preview Data</Text>
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
            <PreviewMiniPanel title="States" values={item.states} empty="No explicit states" />
            <PreviewMiniPanel title="Variants" values={item.variants} empty="No variants" />
            <PreviewMiniPanel title="Text" values={item.text.slice(0, 10)} empty="No static text" />
          </SimpleGrid>
          <StatePreviewGrid states={item.states} />
          <InfoRow label="Platform Notes" values={item.platformNotes} empty="No platform-specific branch detected" />
          <InfoRow label="Preview Modes" values={item.previewModes} empty="Default viewport only" />
          <InfoRow label="Components" values={item.components} />
        </Stack>
      </Paper>
    </Stack>
  )
}

function getPreviewFrameHref(link: UiInventoryItem['previewLinks'][number] | undefined) {
  if (!link) return ''
  if (link.kind === 'storybook') return link.iframeHref ?? link.href
  return link.href
}

function PreviewFrame({ href }: { href: string }) {
  if (!href) {
    return (
      <Paper withBorder radius="md" p="md">
        <Text size="sm" c="dimmed">
          No preview target selected.
        </Text>
      </Paper>
    )
  }

  return (
    <Box
      component="iframe"
      src={href}
      title="Real component preview"
      w="100%"
      h={420}
      style={{
        border: '1px solid var(--chatbox-border-primary)',
        borderRadius: 8,
        background: 'var(--chatbox-background-primary)',
      }}
    />
  )
}

function StatePreviewGrid({ states }: { states: string[] }) {
  if (states.length === 0) {
    return (
      <Paper withBorder radius="md" p="sm">
        <Text size="xs" c="dimmed" fw={700} mb={6}>
          Detected State Checklist
        </Text>
        <Text size="sm" c="dimmed">
          No explicit component states were detected in source.
        </Text>
      </Paper>
    )
  }

  return (
    <Box>
      <Text size="xs" c="dimmed" fw={700} mb={6}>
        Detected State Checklist
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
        {states.map((state) => (
          <StatePreviewCard key={state} state={state} />
        ))}
      </SimpleGrid>
    </Box>
  )
}

function StatePreviewCard({ state }: { state: string }) {
  const normalized = state.toLowerCase()
  const color =
    normalized.includes('error') || normalized.includes('failed')
      ? 'red'
      : normalized.includes('success')
        ? 'green'
        : normalized.includes('loading') || normalized.includes('fetching') || normalized.includes('processing')
          ? 'blue'
          : normalized.includes('disabled')
            ? 'gray'
            : normalized.includes('selected') || normalized.includes('active') || normalized.includes('open')
              ? 'violet'
              : 'chatbox-brand'

  const sampleText =
    normalized.includes('loading') || normalized.includes('fetching') || normalized.includes('processing')
      ? 'Progress indicator active'
      : normalized.includes('error') || normalized.includes('failed')
        ? 'Error feedback visible'
        : normalized.includes('disabled')
          ? 'Interaction disabled'
          : normalized.includes('selected') || normalized.includes('active')
            ? 'Selected visual state'
            : normalized.includes('expanded') || normalized.includes('open')
              ? 'Expanded content visible'
              : 'Detected source state'

  return (
    <Paper withBorder radius="md" p="sm">
      <Group gap="xs" mb={6}>
        <Badge color={color} variant="light" size="sm">
          {state}
        </Badge>
      </Group>
      <Paper radius="sm" p="xs" bg="var(--chatbox-background-primary)">
        <Text size="xs" fw={600}>
          {sampleText}
        </Text>
        <Text size="xs" c="dimmed" mt={4}>
          This card lists a detected `{state}` branch. It is not a rendered component fixture.
        </Text>
      </Paper>
    </Paper>
  )
}

function PreviewMiniPanel({ title, values, empty }: { title: string; values: string[]; empty: string }) {
  return (
    <Paper withBorder radius="md" p="sm">
      <Text size="xs" c="dimmed" fw={700} mb={6}>
        {title}
      </Text>
      {values.length > 0 ? (
        <Stack gap={4}>
          {values.slice(0, 6).map((value) => (
            <Text key={value} size="xs" truncate>
              {value}
            </Text>
          ))}
        </Stack>
      ) : (
        <Text size="xs" c="dimmed">
          {empty}
        </Text>
      )}
    </Paper>
  )
}

function PreviewLinks({
  links,
  onSelect,
}: {
  links: UiInventoryItem['previewLinks']
  onSelect?: (link: UiInventoryItem['previewLinks'][number]) => void
}) {
  return (
    <Group gap="xs">
      {links.slice(0, 6).map((link) =>
        link.kind === 'route' && onSelect ? (
          <Button
            key={`${link.kind}-${link.href}-${link.label}`}
            type="button"
            size="xs"
            variant="outline"
            rightSection={<ScalableIcon icon={IconExternalLink} />}
            onClick={() => onSelect?.(link)}
          >
            {link.label}
          </Button>
        ) : link.kind === 'route' ? (
          <Button
            key={`${link.kind}-${link.href}-${link.label}`}
            component={Link}
            to={link.href}
            size="xs"
            variant="outline"
            rightSection={<ScalableIcon icon={IconExternalLink} />}
          >
            {link.label}
          </Button>
        ) : onSelect ? (
          <Button
            key={`${link.kind}-${link.href}-${link.label}`}
            type="button"
            size="xs"
            variant="outline"
            rightSection={<ScalableIcon icon={IconExternalLink} />}
            onClick={() => onSelect(link)}
          >
            {link.label}
          </Button>
        ) : (
          <Button
            key={`${link.kind}-${link.href}-${link.label}`}
            component="a"
            href={link.href}
            target="_blank"
            rel="noreferrer"
            size="xs"
            variant="outline"
            rightSection={<ScalableIcon icon={IconExternalLink} />}
          >
            {link.label}
          </Button>
        )
      )}
      {links.length > 6 && (
        <Badge variant="light" size="sm">
          +{links.length - 6}
        </Badge>
      )}
    </Group>
  )
}

function InfoRow({
  label,
  values,
  empty = 'None',
  scroll = false,
}: {
  label: string
  values: string[]
  empty?: string
  scroll?: boolean
}) {
  const content = values.length ? (
    <Group gap={6}>
      {values.map((value) => (
        <Badge key={value} variant="default" size="sm" maw={260} className="normal-case">
          <Text span truncate size="xs">
            {value}
          </Text>
        </Badge>
      ))}
    </Group>
  ) : (
    <Text size="xs" c="dimmed">
      {empty}
    </Text>
  )

  return (
    <Box>
      <Text size="xs" c="dimmed" fw={700} mb={4}>
        {label}
      </Text>
      {scroll && values.length > 10 ? (
        <ScrollArea h={86} offsetScrollbars>
          {content}
        </ScrollArea>
      ) : (
        content
      )}
    </Box>
  )
}

export default UiInventoryPage
