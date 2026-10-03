/* Factory reference photo of the selected catalogue model.

   Every category is a studio photo of the real bag on a pure white background, cropped so the bag
   fills the frame. White backgrounds multiply away into the panel's own light gradient, so the bag
   looks like it stands in the panel instead of sitting on a white rectangle. Nothing here needs a
   canvas, WebGL or the three.js viewer the legacy page bootstrapped.

   The images are imported instead of copied into public/: Vite bundles and hashes them with the
   rest of the build, so the same URL resolves in dev and in the built page. */
import type { Bag } from '../../core/factory.ts';
import boxBagPhoto from '../../../bagmodelimages/box bag model.png';
import dCutBagPhoto from '../../../bagmodelimages/dcutmodel.png';
import wCutBagPhoto from '../../../bagmodelimages/wcutmodel.png';

/* One reference photo per category, keyed by the names the catalogue uses. */
const PHOTOS: Record<string, string> = {
  'Box Bag': boxBagPhoto,
  'D Cut Bag': dCutBagPhoto,
  'W Cut Bag': wCutBagPhoto,
};

export interface BagPreviewProps {
  bag: Bag;
}

export function BagPreview({ bag }: BagPreviewProps) {
  /* A rate card imported on the admin panel may carry a category the catalogue has no photo for;
     the box bag shot then stands in, so the panel is never empty. */
  const photo = PHOTOS[bag.category] || PHOTOS['Box Bag'];

  return (
    <div className="w-full h-64 relative bg-gradient-to-b from-emerald-900/5 via-slate-100 to-white flex items-center justify-center">
      <img
        id="bag-preview-photo"
        src={photo}
        alt={'MHS ' + bag.category + ' reference photo: ' + bag.name}
        draggable={false}
        className="w-full h-full object-contain select-none mix-blend-multiply"
      />
    </div>
  );
}
