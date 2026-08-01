import React from 'react';
import {useApp} from '../store';
import {DecisionUnit} from '../flow';

export const WiredDecisionUnit = ({rec, openModal}) => {
    const {active, apply, undo} = useApp();
    return (
        <DecisionUnit
            rec={rec}
            activeIds={active}
            onCommit={apply}
            onUndo={undo}
            // TODO(feature): no real conflict-resolution flow exists yet (e.g.
            // undo the blocking active rec) — warn instead of failing silently
            // so a user hitting a genuine conflict sees something in devtools.
            onResolveConflict={() => console.warn('[WiredDecisionUnit] resolve-conflict requested but not implemented for rec', rec?.id)}
            openModal={openModal}
        />
    );
};
