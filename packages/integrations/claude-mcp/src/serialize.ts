// Serialization to/from openDAW's binary .od format. toBytes converts the in-memory builder
// result (ProjectImpl) into Andrei's box graph via ProjectConverter.toSkeleton, then encodes
// it with the OPEN magic header (ProjectSkeleton.encode) — the exact format his studio loads.
import {ProjectConverter, ProjectImpl} from "@opendaw/studio-scripting"
import {ProjectSkeleton} from "@opendaw/studio-adapters"

export const toBytes = (project: ProjectImpl): ArrayBufferLike => {
  const skeleton = ProjectConverter.toSkeleton(project)
  return ProjectSkeleton.encode(skeleton.boxGraph)
}

export const fromBytes = (buffer: ArrayBufferLike): ProjectSkeleton => ProjectSkeleton.decode(buffer)
