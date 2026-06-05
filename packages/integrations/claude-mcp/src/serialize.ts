import {ProjectConverter, ProjectImpl} from "@opendaw/studio-scripting"
import {ProjectSkeleton} from "@opendaw/studio-adapters"

export const toBytes = (project: ProjectImpl): ArrayBuffer => {
  const skeleton = ProjectConverter.toSkeleton(project)
  return ProjectSkeleton.encode(skeleton.boxGraph)
}

export const fromBytes = (buffer: ArrayBufferLike): ProjectSkeleton => ProjectSkeleton.decode(buffer)
