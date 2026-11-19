import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DataProvenanceFooter from '@/components/DataProvenanceFooter'
import { JPS_SELANGOR_PORTAL_URL } from '@/lib/jpsSource'

describe('DataProvenanceFooter', () => {
    it('links the JPS Selangor attribution to the official portal', () => {
        render(<DataProvenanceFooter />)
        const link = screen.getByRole('link', { name: 'JPS Selangor' })
        expect(link).toHaveAttribute('href', JPS_SELANGOR_PORTAL_URL)
        expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    })

    it('says the data is unofficial', () => {
        render(<DataProvenanceFooter />)
        expect(screen.getByText(/Unofficial — not a JPS warning service/)).toBeInTheDocument()
    })})
