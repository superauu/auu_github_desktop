import React, { useMemo } from 'react';
import { GitCommit } from '@/services/git/types';

interface GitGraphRendererProps {
  commits: GitCommit[];
  selectedIndex: number;
  rowHeight?: number;
}

const LANE_WIDTH = 18;
const LANE_OFFSET = 14;
const ROW_HEIGHT = 44; // Matches commit item row height

const LANE_COLORS = [
  '#6366f1', // Indigo
  '#22c55e', // Emerald
  '#f59e0b', // Amber
  '#06b6d4', // Cyan
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#3b82f6', // Blue
];

interface GraphNode {
  commit: GitCommit;
  index: number;
  lane: number;
  x: number;
  y: number;
  color: string;
}

interface GraphPath {
  id: string;
  d: string;
  color: string;
}

export const GitGraphRenderer: React.FC<GitGraphRendererProps> = ({
  commits,
  selectedIndex,
  rowHeight = ROW_HEIGHT,
}) => {
  const { nodes, paths, maxLane } = useMemo(() => {
    if (!commits || commits.length === 0) {
      return { nodes: [], paths: [], maxLane: 0 };
    }

    const commitMap = new Map<string, number>();
    commits.forEach((c, idx) => commitMap.set(c.hash, idx));

    const laneOccupiedUntil: number[] = [];
    const commitLanes: number[] = [];

    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      let assignedLane = -1;

      // Check if any existing lane was reserved for this commit
      for (let l = 0; l < laneOccupiedUntil.length; l++) {
        if (laneOccupiedUntil[l] === i) {
          assignedLane = l;
          break;
        }
      }

      // If no lane reserved, find first free lane
      if (assignedLane === -1) {
        for (let l = 0; l < laneOccupiedUntil.length; l++) {
          if (laneOccupiedUntil[l] < i) {
            assignedLane = l;
            break;
          }
        }
      }

      if (assignedLane === -1) {
        assignedLane = laneOccupiedUntil.length;
        laneOccupiedUntil.push(-1);
      }

      commitLanes[i] = assignedLane;

      // Reserve lane for parents
      if (commit.parents && commit.parents.length > 0) {
        // First parent continues on this lane
        const firstParentIdx = commitMap.get(commit.parents[0]);
        if (firstParentIdx !== undefined) {
          laneOccupiedUntil[assignedLane] = firstParentIdx;
        }

        // Additional parents take new lanes
        for (let p = 1; p < commit.parents.length; p++) {
          const parentIdx = commitMap.get(commit.parents[p]);
          if (parentIdx !== undefined) {
            let pLane = laneOccupiedUntil.findIndex((until) => until < i);
            if (pLane === -1) {
              pLane = laneOccupiedUntil.length;
              laneOccupiedUntil.push(-1);
            }
            laneOccupiedUntil[pLane] = parentIdx;
          }
        }
      } else {
        laneOccupiedUntil[assignedLane] = -1;
      }
    }

    const calculatedNodes: GraphNode[] = [];
    let calculatedMaxLane = 0;

    for (let i = 0; i < commits.length; i++) {
      const lane = commitLanes[i] || 0;
      if (lane > calculatedMaxLane) calculatedMaxLane = lane;

      const x = lane * LANE_WIDTH + LANE_OFFSET;
      const y = i * rowHeight + rowHeight / 2;
      const color = LANE_COLORS[lane % LANE_COLORS.length];

      calculatedNodes.push({
        commit: commits[i],
        index: i,
        lane,
        x,
        y,
        color,
      });
    }

    // Build Bezier connecting paths between commits and their parents
    const calculatedPaths: GraphPath[] = [];

    for (let i = 0; i < commits.length; i++) {
      const node = calculatedNodes[i];
      const parents = commits[i].parents || [];

      for (const parentHash of parents) {
        const parentIdx = commitMap.get(parentHash);
        if (parentIdx !== undefined && parentIdx > i) {
          const parentNode = calculatedNodes[parentIdx];

          const x1 = node.x;
          const y1 = node.y;
          const x2 = parentNode.x;
          const y2 = parentNode.y;

          let d = '';
          if (x1 === x2) {
            // Straight vertical line
            d = `M ${x1} ${y1} L ${x2} ${y2}`;
          } else {
            // Cubic Bezier curve for branch forks and merges
            const midY = (y1 + y2) / 2;
            d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
          }

          calculatedPaths.push({
            id: `${commits[i].hash}-${parentHash}`,
            d,
            color: node.color,
          });
        }
      }
    }

    return {
      nodes: calculatedNodes,
      paths: calculatedPaths,
      maxLane: calculatedMaxLane,
    };
  }, [commits, rowHeight]);

  const svgWidth = Math.max((maxLane + 1) * LANE_WIDTH + 24, 38);
  const totalHeight = commits.length * rowHeight;

  return (
    <svg
      width={svgWidth}
      height={totalHeight}
      className="shrink-0 pointer-events-none select-none overflow-visible"
    >
      <defs>
        {LANE_COLORS.map((color, idx) => (
          <filter key={idx} id={`glow-${idx}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={color} floodOpacity="0.65" />
          </filter>
        ))}
      </defs>

      {/* Bezier branch connection lines */}
      <g strokeWidth="2" fill="none" strokeLinecap="round">
        {paths.map((path) => (
          <path
            key={path.id}
            d={path.d}
            stroke={path.color}
            strokeOpacity="0.65"
          />
        ))}
      </g>

      {/* Commit Node circles */}
      {nodes.map((node) => {
        const isSelected = selectedIndex === node.index;
        const isHead = node.commit.refs?.some((r) => r.includes('HEAD'));
        const isTag = node.commit.refs?.some((r) => r.startsWith('tag:'));

        return (
          <g key={node.commit.hash}>
            {/* Outer selection ring if selected */}
            {isSelected && (
              <circle
                cx={node.x}
                cy={node.y}
                r="7.5"
                fill="none"
                stroke={node.color}
                strokeWidth="1.5"
                strokeDasharray="2 2"
                className="animate-spin-slow"
              />
            )}

            {/* Commit node body */}
            <circle
              cx={node.x}
              cy={node.y}
              r={isHead ? 5 : isTag ? 4.5 : 4}
              fill={isSelected || isHead ? node.color : 'hsl(var(--background))'}
              stroke={node.color}
              strokeWidth="2.5"
              filter={isSelected ? `url(#glow-${node.lane % LANE_COLORS.length})` : undefined}
            />

            {/* Center dot for unselected HEAD or Tag */}
            {isHead && !isSelected && (
              <circle cx={node.x} cy={node.y} r="2" fill={node.color} />
            )}
          </g>
        );
      })}
    </svg>
  );
};
