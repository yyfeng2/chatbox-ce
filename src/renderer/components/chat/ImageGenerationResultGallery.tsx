import { memo, useMemo } from 'react'
import { imageGenerationSourcesToPictures } from './image-generation-result'
import { PictureGallery } from './PictureGallery'

export const ImageGenerationResultGallery = memo(function ImageGenerationResultGallery({
  images,
}: {
  images: readonly string[]
}) {
  const pictures = useMemo(() => imageGenerationSourcesToPictures(images), [images])
  return pictures.length > 0 ? <PictureGallery pictures={pictures} /> : null
})
