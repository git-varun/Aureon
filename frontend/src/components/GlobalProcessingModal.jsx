import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu } from 'lucide-react';

export default function GlobalProcessingModal({ isOpen, taskName }) {
    const [progress, setProgress] = useState(0);
    const [flavorText, setFlavorText] = useState("Initializing...");

    useEffect(() => {
        let interval;
        if (isOpen) {
            setProgress(0);
            setFlavorText("Initializing secure connection...");

            interval = setInterval(() => {
                setProgress(old => {
                    const next = old + Math.floor(Math.random() * 12) + 4;

                    if (next >= 90) {
                        setFlavorText("Finalizing intelligence models...");
                        return 90; // Stall at 90% until backend actually finishes
                    } else if (next > 65) {
                        setFlavorText("Executing AI neural analysis...");
                    } else if (next > 35) {
                        setFlavorText("Calculating quantitative risk metrics...");
                    } else {
                        setFlavorText("Fetching real-time market data...");
                    }
                    return next;
                });
            }, 600);
        } else {
            // Instantly snap to 100% right as the modal receives the close signal
            setProgress(100);
            setFlavorText("Task Complete!");
        }
        return () => clearInterval(interval);
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { delay: 0.3 } }} // Slight delay so user sees 100%
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
                        backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(16px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: -20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        style={{
                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
                            border: '1px solid rgba(56, 189, 248, 0.2)',
                            borderRadius: '20px', padding: '40px', width: '450px',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(56, 189, 248, 0.1)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'
                        }}
                    >
                        {/* 🚀 Guaranteed Spinning Icon via Framer Motion */}
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                            style={{ marginBottom: '24px', color: '#38bdf8', padding: '16px', backgroundColor: 'rgba(56, 189, 248, 0.1)', borderRadius: '50%' }}
                        >
                            <Cpu size={40} />
                        </motion.div>

                        <h2 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '22px', fontWeight: '800', letterSpacing: '-0.5px' }}>
                            {taskName || "System Processing"}
                        </h2>

                        {/* Dynamic Flavor Text */}
                        <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 32px 0', height: '20px' }}>
                            {flavorText}
                        </p>

                        {/* 🚀 Upgraded Gradient Progress Bar */}
                        <div style={{ width: '100%', backgroundColor: '#0f172a', borderRadius: '10px', height: '8px', overflow: 'hidden', border: '1px solid #1e293b' }}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                transition={{ ease: "easeOut", duration: 0.4 }}
                                style={{
                                    height: '100%',
                                    background: 'linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)',
                                    borderRadius: '10px',
                                    boxShadow: '0 0 15px rgba(56, 189, 248, 0.6)'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: '10px' }}>
                            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>System Status</span>
                            <motion.span
                                key={progress} // Forces animation on number change
                                initial={{ opacity: 0.5, y: -2 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{ fontSize: '12px', color: progress === 100 ? '#10b981' : '#38bdf8', fontWeight: '900' }}
                            >
                                {progress}%
                            </motion.span>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}