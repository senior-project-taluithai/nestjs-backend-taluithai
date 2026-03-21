import { haversineKm } from './haversine';

export interface Point {
  latitude: number;
  longitude: number;
}

export interface Cluster<T extends Point> {
  centroid: { latitude: number; longitude: number };
  members: T[];
}

/**
 * K-Means clustering on geographic coordinates using Haversine distance.
 * Uses K-Means++ initialization for better centroid spread.
 */
export function kMeans<T extends Point>(
  points: T[],
  k: number,
  maxIterations = 50,
): Cluster<T>[] {
  if (points.length === 0) return [];
  if (k <= 0) return [];
  if (k >= points.length) {
    return points.map((p) => ({
      centroid: { latitude: p.latitude, longitude: p.longitude },
      members: [p],
    }));
  }

  // K-Means++ initialization
  const centroids = kMeansPlusPlusInit(points, k);

  let assignments = new Array<number>(points.length).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign each point to nearest centroid
    const newAssignments = points.map((p) => nearestCentroid(p, centroids));

    // Check convergence
    const converged = newAssignments.every((a, i) => a === assignments[i]);
    assignments = newAssignments;

    // Recompute centroids
    for (let c = 0; c < k; c++) {
      const members = points.filter((_, i) => assignments[i] === c);
      if (members.length > 0) {
        centroids[c] = {
          latitude:
            members.reduce((s, m) => s + m.latitude, 0) / members.length,
          longitude:
            members.reduce((s, m) => s + m.longitude, 0) / members.length,
        };
      }
    }

    if (converged) break;
  }

  // Build clusters
  const clusters: Cluster<T>[] = centroids.map((c) => ({
    centroid: c,
    members: [],
  }));
  points.forEach((p, i) => {
    clusters[assignments[i]].members.push(p);
  });

  // Post-balance: redistribute from oversized clusters
  balanceClusters(clusters, Math.ceil(points.length / k) + 1);

  return clusters.filter((c) => c.members.length > 0);
}

function kMeansPlusPlusInit<T extends Point>(
  points: T[],
  k: number,
): { latitude: number; longitude: number }[] {
  const centroids: { latitude: number; longitude: number }[] = [];

  // Pick first centroid randomly
  const first = points[Math.floor(Math.random() * points.length)];
  centroids.push({ latitude: first.latitude, longitude: first.longitude });

  for (let i = 1; i < k; i++) {
    // Compute distance from each point to nearest existing centroid
    const distances = points.map((p) => {
      const minDist = Math.min(
        ...centroids.map((c) =>
          haversineKm(p.latitude, p.longitude, c.latitude, c.longitude),
        ),
      );
      return minDist * minDist; // squared distance for weighting
    });

    // Weighted random selection
    const totalDist = distances.reduce((s, d) => s + d, 0);
    let r = Math.random() * totalDist;
    let idx = 0;
    for (let j = 0; j < distances.length; j++) {
      r -= distances[j];
      if (r <= 0) {
        idx = j;
        break;
      }
    }

    centroids.push({
      latitude: points[idx].latitude,
      longitude: points[idx].longitude,
    });
  }

  return centroids;
}

function nearestCentroid(
  point: Point,
  centroids: { latitude: number; longitude: number }[],
): number {
  let minDist = Infinity;
  let minIdx = 0;
  for (let i = 0; i < centroids.length; i++) {
    const d = haversineKm(
      point.latitude,
      point.longitude,
      centroids[i].latitude,
      centroids[i].longitude,
    );
    if (d < minDist) {
      minDist = d;
      minIdx = i;
    }
  }
  return minIdx;
}

function balanceClusters<T extends Point>(
  clusters: Cluster<T>[],
  maxSize: number,
): void {
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const cluster of clusters) {
      while (cluster.members.length > maxSize) {
        // Find the member farthest from this cluster's centroid
        let farthestIdx = 0;
        let farthestDist = 0;
        for (let i = 0; i < cluster.members.length; i++) {
          const d = haversineKm(
            cluster.members[i].latitude,
            cluster.members[i].longitude,
            cluster.centroid.latitude,
            cluster.centroid.longitude,
          );
          if (d > farthestDist) {
            farthestDist = d;
            farthestIdx = i;
          }
        }

        // Find the smallest cluster that is closest to this member
        const member = cluster.members[farthestIdx];
        let bestCluster: Cluster<T> | null = null;
        let bestDist = Infinity;
        for (const other of clusters) {
          if (other === cluster) continue;
          if (other.members.length >= maxSize) continue;
          const d = haversineKm(
            member.latitude,
            member.longitude,
            other.centroid.latitude,
            other.centroid.longitude,
          );
          if (d < bestDist) {
            bestDist = d;
            bestCluster = other;
          }
        }

        if (bestCluster) {
          cluster.members.splice(farthestIdx, 1);
          bestCluster.members.push(member);
          changed = true;
        } else {
          break; // No room elsewhere
        }
      }
    }
    if (!changed) break;
  }
}
