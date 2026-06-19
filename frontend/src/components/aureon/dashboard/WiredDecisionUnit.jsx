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
            onResolveConflict={() => {}}
            openModal={openModal}
        />
    );
};
