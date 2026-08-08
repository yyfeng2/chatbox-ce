import { Flex, Image } from '@mantine/core'
import type { MessagePicture } from '@shared/types'
import { useQuery } from '@tanstack/react-query'
import { memo } from 'react'
import { ImageViewer, ImageViewerItem } from '@/components/ImageViewer'
import { useFetchBlob } from '@/hooks/useBlob'
import { useIsSmallScreen } from '@/hooks/useScreenChange'

function getBase64ImageSize(base64: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const cleanup = () => {
      img.onload = null
      img.onerror = null
      try {
        img.src = ''
      } catch {
        // ignore
      }
    }
    img.onload = () => {
      const size = { width: img.width, height: img.height }
      cleanup()
      resolve(size)
    }
    img.onerror = (err) => {
      cleanup()
      reject(err)
    }
    img.src = base64
  })
}

export type PictureGalleryProps = {
  pictures: MessagePicture[]
  compact?: boolean
  onReport?(picture: MessagePicture): void
}

export const PictureGallery = memo(({ pictures, compact, onReport }: PictureGalleryProps) => {
  const isSmallScreen = useIsSmallScreen()
  const imageHeight = compact ? (isSmallScreen ? 60 : 100) : isSmallScreen ? 100 : 200

  return (
    <Flex gap="sm" wrap="wrap">
      <ImageViewer pictures={pictures} onReport={onReport}>
        {pictures.map((picture) =>
          picture.storageKey ? (
            <ImageInStorageGalleryItem key={picture.storageKey} storageKey={picture.storageKey} height={imageHeight} />
          ) : picture.url ? (
            <ImageViewerItem
              key={picture.url}
              original={picture.url}
              thumbnail={picture.url}
              width={1024}
              height={1024}
            >
              {({ ref, open }) => (
                <Image
                  src={picture.url}
                  h={imageHeight}
                  w="auto"
                  fit="contain"
                  radius="md"
                  ref={ref}
                  onClick={open}
                  className="cursor-pointer"
                />
              )}
            </ImageViewerItem>
          ) : undefined
        )}
      </ImageViewer>
    </Flex>
  )
})

const ImageInStorageGalleryItem = ({ storageKey, height }: { storageKey: string; height?: number }) => {
  const isSmallScreen = useIsSmallScreen()
  const fallbackHeight = isSmallScreen ? 100 : 200
  const fetchBlob = useFetchBlob()
  const { data: picture } = useQuery({
    queryKey: ['image-in-storage-gallery-item', storageKey],
    queryFn: async ({ queryKey: [, key] }) => {
      const blob = await fetchBlob(key as string)
      if (!blob) return null
      const base64 = blob.startsWith('data:image/') ? blob : `data:image/png;base64,${blob}`
      const size = await getBase64ImageSize(base64)
      return { ...size, data: base64 }
    },
    staleTime: Infinity,
    gcTime: 60 * 1000,
  })

  return picture ? (
    <ImageViewerItem original={picture.data} thumbnail={picture.data} width={picture.width} height={picture.height}>
      {({ ref, open }) => (
        <Image
          src={picture.data}
          h={height ?? fallbackHeight}
          w="auto"
          fit="contain"
          radius="md"
          ref={ref}
          onClick={open}
          className="cursor-pointer"
        />
      )}
    </ImageViewerItem>
  ) : null
}
