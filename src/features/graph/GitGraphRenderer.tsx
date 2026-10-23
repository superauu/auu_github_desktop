import React, { useMemo, useEffect } from 'react';
import { GitCommit } from '@/services/git/types';

interface GitGraphRendererProps {
  onWidthChange?: (width: number) => void;
  commits: GitCommit[];
  selectedIndex: number;
  rowHeight?: number;
  visibleStart?: number;
  visibleEnd?: number;
  hasWipNode?: boolean;
  isWipSelected?: boolean;
}

const LANE_WIDTH = 16;
const LANE_OFFSET = 32; // Centered in the 64px GRAPH column
const ROW_HEIGHT = 42; // Matches commit item row height (42px)

const LANE_COLORS = [
  'hsl(var(--git-renamed))', // Sky Blue (Primary)
  'hsl(var(--git-added))', // Emerald
  'hsl(var(--git-tag))', // Amber
  'hsl(var(--git-branch))', // Indigo / Cobalt
  'hsl(var(--git-commit))', // Cyan
  'hsl(var(--git-untracked))', // Teal
  'hsl(var(--git-branch))', // Slate Blue
];

interface GraphNode {
  commit?: GitCommit;
  isWip?: boolean;
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
  isDashed?: boolean;
  fromRow?: number;
  toRow?: number;
}

export const GitGraphRenderer: React.FC<GitGraphRendererProps> = ({
  commits,
  selectedIndex,
  rowHeight = ROW_HEIGHT,
  hasWipNode = false,
  visibleStart = 0,
  visibleEnd = commits.length,
  isWipSelected = false,
  onWidthChange,
}) => {
  const { nodes, paths, maxLane } = useMemo(() => {
    if (!commits || (commits.length === 0 && !hasWipNode)) {
      return { nodes: [], paths: [], maxLane: 0 };
    }

    const rowOffset = hasWipNode ? 1 : 0;
    const commitMap = new Map<string, number>();
    commits.forEach((c, idx) => commitMap.set(c.hash, idx + rowOffset));

    const laneOccupiedUntil: number[] = [];
    const commitLanes: number[] = [];

    const calculatedNodes: GraphNode[] = [];
    const calculatedPaths: GraphPath[] = [];
    let calculatedMaxLane = 0;

    // Add WIP node if requested
    if (hasWipNode) {
      laneOccupiedUntil.push(1);
      calculatedNodes.push({
        isWip: true,
        index: 0,
        lane: 0,
        x: LANE_OFFSET,
        y: rowHeight / 2,
        color: 'hsl(var(--git-renamed))',
      });
    }

    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      const actualRowIndex = i + rowOffset;
      let assignedLane = -1;

      // Check if any existing lane was reserved for this commit
      for (let l = 0; l < laneOccupiedUntil.length; l++) {
        if (laneOccupiedUntil[l] === actualRowIndex) {
          assignedLane = l;
          break;
        }
      }

      // If no lane reserved, find first free lane
      if (assignedLane === -1) {
        for (let l = 0; l < laneOccupiedUntil.length; l++) {
          if (laneOccupiedUntil[l] < actualRowIndex) {
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
        const firstParentIdx = commitMap.get(commit.parents[0]);
        if (firstParentIdx !== undefined) {
          laneOccupiedUntil[assignedLane] = firstParentIdx;
        }

        for (let p = 1; p < commit.parents.length; p++) {
          const parentIdx = commitMap.get(commit.parents[p]);
          if (parentIdx !== undefined) {
            let pLane = laneOccupiedUntil.findIndex((until) => until < actualRowIndex);
            if (pLane === -1) {
              pLane = laneOccupiedUntil.length;
              laneOccupiedUntil.push(-1);
            }
            laneOccupiedUntil[pLane] = parentIdx;
          }
        }
      }

      calculatedMaxLane = Math.max(calculatedMaxLane, assignedLane);

      calculatedNodes.push({
        commit,
        index: actualRowIndex,
        lane: assignedLane,
        x: LANE_OFFSET + assignedLane * LANE_WIDTH,
        y: actualRowIndex * rowHeight + rowHeight / 2,
        color: LANE_COLORS[assignedLane % LANE_COLORS.length],
      });
    }

    // Connect WIP node to HEAD node
    if (hasWipNode && calculatedNodes.length > 1) {
      const wipNode = calculatedNodes[0];
      const headNode = calculatedNodes.find((node) => node.commit?.refs?.some((ref) => ref === 'HEAD' || ref.startsWith('HEAD -> '))) || calculatedNodes[1];
      calculatedPaths.push({
        id: 'wip-to-head',
        d: `M ${wipNode.x} ${wipNode.y} L ${headNode.x} ${headNode.y}`,
        color: 'hsl(var(--git-renamed))',
        isDashed: true,
      });
    }

    const nodesByHash = new Map(calculatedNodes.filter((node) => node.commit).map((node) => [node.commit!.hash, node]));
    // Generate paths between commits and parents
    for (let i = 0; i < commits.length; i++) {
      const node = calculatedNodes[i + rowOffset];
      const parents = commits[i].parents || [];

      for (const parentHash of parents) {
        const parentNode = nodesByHash.get(parentHash);
        if (parentNode) {
          const x1 = node.x;
          const y1 = node.y;
          const x2 = parentNode.x;
          const y2 = parentNode.y;

          let d: string;
          if (x1 === x2) {
            d = `M ${x1} ${y1} L ${x2} ${y2}`;
          } else {
            const midY = (y1 + y2) / 2;
            d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
          }

          calculatedPaths.push({
            id: `${commits[i].hash}-${parentHash}`,
            d,
            color: node.color,
            fromRow: node.index, toRow: parentNode.index,
          });
        }
      }
    }

    return {
      nodes: calculatedNodes,
      paths: calculatedPaths,
      maxLane: calculatedMaxLane,
    };
  }, [commits, rowHeight, hasWipNode]);

  const svgWidth = Math.max((maxLane + 1) * LANE_WIDTH + 32, 64);
  useEffect(() => { onWidthChange?.(svgWidth); }, [onWidthChange, svgWidth]);
  const totalHeight = (commits.length + (hasWipNode ? 1 : 0)) * rowHeight;

  return (
    <svg
      width={svgWidth}
      height={totalHeight}
      className="shrink-0 pointer-events-none select-none overflow-visible"
    >
      <defs>
        {LANE_COLORS.map((color, idx) => (
          <filter key={idx} id={`glow-${idx}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.2" floodColor={color} floodOpacity="0.3" />
          </filter>
        ))}
      </defs>

      {/* Bezier branch connection lines */}
      <g strokeWidth="2" fill="none" strokeLinecap="round">
        {paths.filter((path) => path.fromRow === undefined || (Math.min(path.fromRow, path.toRow!) <= visibleEnd + 1 && Math.max(path.fromRow, path.toRow!) >= visibleStart)).map((path) => (
          <path
            key={path.id}
            d={path.d}
            stroke={path.color}
            strokeOpacity="0.75"
            strokeDasharray={path.isDashed ? "3 3" : undefined}
          />
        ))}
      </g>

      {/* Node circles */}
      {nodes.filter((node) => node.index >= visibleStart && node.index <= visibleEnd + 1).map((node) => {
        if (node.isWip) {
          return (
            <g key="wip-node">
              {isWipSelected && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="8.5"
                  fill="none"
                  stroke="hsl(var(--git-renamed))"
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                />
              )}
              {/* WIP outer dashed circle */}
              <circle
                cx={node.x}
                cy={node.y}
                r="6"
                fill="hsl(var(--background))"
                stroke="hsl(var(--git-renamed))"
                strokeWidth="2"
                strokeDasharray="2.5 2"
              />
              {/* Inner plus dot */}
              <circle cx={node.x} cy={node.y} r="2" fill="hsl(var(--git-renamed))" />
            </g>
          );
        }

        const isSelected = selectedIndex === node.index;
        const isHead = node.commit?.refs?.some((r) => r.includes('HEAD'));
        const isTag = node.commit?.refs?.some((r) => r.startsWith('tag:'));

        return (
          <g key={node.commit?.hash}>
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
